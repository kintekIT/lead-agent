require('dotenv').config();
const express = require('express');
const path    = require('path');
const { executarAgente }  = require('./agent');
const { executarRPA }     = require('./rpa');
const { executarReceita } = require('./executor-receita');
const { buscarLeadsReceita } = require('./tools/receita');
const { autenticar, exigirAdmin, saldoCreditos } = require('./auth/middleware');
const { supabaseAdmin, configurado } = require('./auth/supabase');
const { helmetMiddleware, corsMiddleware, limiteApi } = require('./middleware/seguranca');
const { validar } = require('./middleware/validar');
const { logRequisicao } = require('./middleware/log-requisicao');
const { logger } = require('./utils/logger');
const {
  iniciarBodySchema, previaBodySchema, sessionIdParamSchema,
  adminListQuerySchema, adminUsuarioIdParamSchema, adminPapelBodySchema,
  compraBodySchema, compraIdParamSchema,
} = require('./validation/schemas');
const { tamanhoPool } = require('./config/pool-dedup');
const { PACOTES } = require('./config/pacotes-creditos');
const { gerarPayloadPix } = require('./utils/pix');
const QRCode = require('qrcode');

const PIX_CHAVE  = process.env.PIX_CHAVE || '';
const PIX_NOME   = process.env.PIX_NOME_RECEBEDOR || 'LEAD AGENT';
const PIX_CIDADE = process.env.PIX_CIDADE || 'SAO PAULO';

const app = express();
app.use(logRequisicao); // primeiro middleware (história 5.1): registra até requisição barrada por rate limit/auth
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../public')));

/* ── Rotas públicas (sem login) ─────────────────────────────────────────── */

// Config do frontend: expõe apenas URL + anon key (segura para o navegador)
app.get('/config.js', (_req, res) => {
  res.type('application/javascript').send(
    `window.__ENV = ${JSON.stringify({
      SUPABASE_URL:      process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
    })};`
  );
});

// supabase-js servido localmente (sem depender de CDN)
app.get('/vendor/supabase.js', (_req, res) => {
  res.sendFile(require.resolve('@supabase/supabase-js/dist/umd/supabase.js'));
});

/* ── Daqui para baixo, toda rota /api/* exige rate limit (história 4.1) e JWT válido (história 0.3) ── */
app.use('/api', limiteApi);
app.use('/api', autenticar);

// Sessões ativas: guardam eventos emitidos e clientes SSE conectados
const sessoes = new Map();

/* ── GET /api/me ── dados da conta: plano, saldo, papel */
app.get('/api/me', async (req, res) => {
  try {
    const [{ data: perfil }, saldo] = await Promise.all([
      supabaseAdmin.from('profiles').select('email, role, criado_em, termos_aceitos_em').eq('id', req.usuario.id).single(),
      saldoCreditos(req.usuario.id),
    ]);
    res.json({
      id:        req.usuario.id,
      email:     perfil?.email ?? req.usuario.email,
      role:      req.usuario.role,
      criadoEm:  perfil?.criado_em ?? null,
      saldo,
      plano:     saldo > 0 ? 'premium' : 'free',
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

/* ── POST /api/iniciar ── inicia o agente ou RPA e retorna sessionId */
app.post('/api/iniciar', validar(iniciarBodySchema, 'body'), async (req, res) => {
  const { nicho, regiao, quantidade: qty, modo } = req.body;

  if (modo === 'agente' && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sua_chave_aqui')) {
    return res.status(400).json({ erro: 'ANTHROPIC_API_KEY não configurada no .env — use o modo RPA.' });
  }

  // Regra de negócio no backend (história 1.4): free (saldo 0) não gera leads;
  // premium gera até o limite do saldo.
  let saldo;
  try {
    saldo = await saldoCreditos(req.usuario.id);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
  if (saldo <= 0) {
    return res.status(403).json({ erro: 'Você está sem créditos. Compre um pacote para gerar leads.', saldo });
  }
  // Não bloqueia mais qty > saldo (história 2.3): entrega até o limite do
  // saldo e informa, em vez de recusar a busca inteira.

  // Registra a busca no histórico (tabela searches)
  let searchId = null;
  try {
    const { data } = await supabaseAdmin
      .from('searches')
      .insert({ user_id: req.usuario.id, nicho, regiao, qtd_solicitada: qty })
      .select('id')
      .single();
    searchId = data?.id ?? null;
  } catch { /* histórico não pode derrubar a busca */ }

  const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  sessoes.set(sessionId, { eventos: [], clientes: new Set(), arquivo: null, userId: req.usuario.id });

  res.json({ sessionId });

  const emit = (tipo, dados) => {
    const sessao = sessoes.get(sessionId);
    if (!sessao) return;
    const evento  = { tipo, dados, ts: Date.now() };
    sessao.eventos.push(evento);
    const payload = `data: ${JSON.stringify(evento)}\n\n`;
    sessao.clientes.forEach(c => { try { c.write(payload); } catch {} });
  };

  const executor = modo === 'receita' ? executarReceita
                 : modo === 'rpa'     ? executarRPA
                 : executarAgente;

  const atualizarBusca = (campos) => {
    if (!searchId) return;
    supabaseAdmin.from('searches').update(campos).eq('id', searchId).then(() => {}, () => {});
  };

  // Só o motor Receita Federal tem débito atômico + dedup de 6 meses
  // (histórias 2.3/3.1) — os motores legados (agente/RPA) seguem ocultos e
  // sem cobrança, como já era antes.
  const aplicarCota = modo === 'receita'
    ? async (leadsPool) => {
        const { data: aceitos, error } = await supabaseAdmin.rpc('entregar_leads', {
          p_user_id:   req.usuario.id,
          p_search_id: searchId,
          p_cnpjs:     leadsPool.map(l => l.cnpj),
          p_limite:    qty,
        });
        if (error) throw new Error(`Falha ao registrar entrega dos leads: ${error.message}`);

        const aceitosSet = new Set(aceitos || []);
        const filtrados  = leadsPool.filter(l => aceitosSet.has(l.cnpj));
        if (filtrados.length < qty) {
          emit('log', { mensagem: `Entregue${filtrados.length === 1 ? '' : 's'} ${filtrados.length} de ${qty} lead(s) pedido(s) — saldo insuficiente ou sem leads novos suficientes (cada lead não se repete por 6 meses).` });
        }
        return filtrados;
      }
    : null;

  const quantidadeBusca = modo === 'receita' ? tamanhoPool(qty) : qty;

  executor(nicho, regiao, quantidadeBusca, emit, aplicarCota)
    .then(resultado => {
      const sessao = sessoes.get(sessionId);
      if (sessao && resultado?.arquivo) sessao.arquivo = resultado.arquivo;
      atualizarBusca({ status: 'concluida', qtd_entregue: resultado?.totalLeads ?? 0, arquivo: resultado?.arquivo ?? null });
      emit('fim', { totalLeads: resultado?.totalLeads ?? 0, arquivo: resultado?.arquivo ?? null });
    })
    .catch(err => {
      atualizarBusca({ status: 'erro' });
      emit('erro', { mensagem: err.message });
    });
});

/* ── POST /api/previa ── conta quantos leads novos existem, sem gerar nem cobrar (história 2.4) */
app.post('/api/previa', validar(previaBodySchema, 'body'), async (req, res) => {
  const { nicho, regiao, quantidade } = req.body;

  const resultado = buscarLeadsReceita(nicho, regiao, tamanhoPool(quantidade));
  if (!resultado.sucesso) {
    return res.status(404).json({ erro: resultado.mensagem });
  }

  let saldo;
  try {
    saldo = await saldoCreditos(req.usuario.id);
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }

  const cnpjs = resultado.leads.map(l => l.cnpj);
  const { data: novosNoPool, error } = await supabaseAdmin.rpc('contar_novos', {
    p_user_id: req.usuario.id,
    p_cnpjs:   cnpjs,
  });
  if (error) return res.status(500).json({ erro: `Falha ao consultar prévia: ${error.message}` });

  const novos = Math.min(novosNoPool ?? 0, quantidade);
  res.json({ totalEncontrado: resultado.leads.length, novos, custoEstimado: novos, saldo });
});

/* ── GET /api/eventos/:id ── stream SSE (token via ?token=) */
app.get('/api/eventos/:id', validar(sessionIdParamSchema, 'params'), (req, res) => {
  const sessao = sessoes.get(req.params.id);
  if (!sessao || sessao.userId !== req.usuario.id) return res.status(404).end();

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Reenvia eventos já emitidos (para reconexão ou page reload)
  sessao.eventos.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
  sessao.clientes.add(res);

  req.on('close', () => sessao.clientes.delete(res));
});

/* ── GET /api/download/:id ── baixa o Excel gerado (token via ?token=) */
app.get('/api/download/:id', validar(sessionIdParamSchema, 'params'), (req, res) => {
  const sessao = sessoes.get(req.params.id);
  if (!sessao || sessao.userId !== req.usuario.id || !sessao.arquivo) {
    return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  }
  res.download(sessao.arquivo);
});

/* ── GET /api/pacotes ── pacotes de créditos disponíveis (história 2.5) */
app.get('/api/pacotes', (_req, res) => {
  res.json(Object.entries(PACOTES).map(([pacote, info]) => ({ pacote, ...info })));
});

/* ── POST /api/compras ── cria uma compra pendente e devolve o Pix pra pagar (história 2.5) */
app.post('/api/compras', validar(compraBodySchema, 'body'), async (req, res) => {
  if (!PIX_CHAVE) {
    return res.status(503).json({ erro: 'Pix ainda não configurado no servidor — defina PIX_CHAVE no .env.' });
  }

  const { pacote } = req.body;
  const info = PACOTES[pacote];

  const { data: compra, error } = await supabaseAdmin
    .from('purchases')
    .insert({ user_id: req.usuario.id, pacote, creditos: info.creditos, valor_centavos: info.valorCentavos })
    .select('id, criado_em')
    .single();
  if (error) return res.status(500).json({ erro: `Falha ao criar a compra: ${error.message}` });

  const payload = gerarPayloadPix({
    chave: PIX_CHAVE,
    valor: info.valorCentavos / 100,
    nome:  PIX_NOME,
    cidade: PIX_CIDADE,
    txid:  compra.id,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(payload);

  res.json({
    id: compra.id,
    pacote,
    creditos: info.creditos,
    valorCentavos: info.valorCentavos,
    criadoEm: compra.criado_em,
    status: 'pendente',
    pixCopiaECola: payload,
    qrCodeDataUrl,
  });
});

/* ── GET /api/compras ── minhas compras (história 2.5) */
app.get('/api/compras', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .select('id, pacote, creditos, valor_centavos, status, criado_em, pago_em')
    .eq('user_id', req.usuario.id)
    .order('criado_em', { ascending: false })
    .limit(20);
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

/* ── GET /api/compras/:id ── status de uma compra específica, pro polling da tela de planos ── */
app.get('/api/compras/:id', validar(compraIdParamSchema, 'params'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .select('id, pacote, creditos, status, criado_em, pago_em')
    .eq('id', req.params.id)
    .eq('user_id', req.usuario.id)
    .single();
  if (error || !data) return res.status(404).json({ erro: 'Compra não encontrada.' });
  res.json(data);
});

/* ── Rotas do painel admin (guard reutilizável — história 0.3) ── */
app.get('/api/admin/ping', exigirAdmin, (req, res) => {
  res.json({ ok: true, admin: req.usuario.email });
});

const ADMIN_PAGINA_TAM = 20;
const BAN_PERMANENTE = '876000h'; // ~100 anos — convenção do GoTrue pra "bloqueado até revogar"

/* ── GET /api/admin/usuarios ── lista + busca por email + paginação (história 6.1) */
app.get('/api/admin/usuarios', exigirAdmin, validar(adminListQuerySchema, 'query'), async (req, res) => {
  const { busca, pagina } = req.query;

  let query = supabaseAdmin
    .from('profiles')
    .select('id, email, role, criado_em', { count: 'exact' })
    .order('criado_em', { ascending: false });
  if (busca) query = query.ilike('email', `%${busca}%`);

  const offset = (pagina - 1) * ADMIN_PAGINA_TAM;
  const { data, error, count } = await query.range(offset, offset + ADMIN_PAGINA_TAM - 1);
  if (error) return res.status(500).json({ erro: `Falha ao listar usuários: ${error.message}` });

  res.json({
    usuarios: data,
    total: count ?? 0,
    pagina,
    totalPaginas: Math.max(1, Math.ceil((count ?? 0) / ADMIN_PAGINA_TAM)),
  });
});

/* ── GET /api/admin/usuarios/:id ── detalhe: saldo, extrato e buscas (história 6.1) */
app.get('/api/admin/usuarios/:id', exigirAdmin, validar(adminUsuarioIdParamSchema, 'params'), async (req, res) => {
  const { id } = req.params;

  const { data: perfil } = await supabaseAdmin
    .from('profiles')
    .select('id, email, role, criado_em, termos_aceitos_em')
    .eq('id', id)
    .single();
  if (!perfil) return res.status(404).json({ erro: 'Usuário não encontrado.' });

  const [saldo, { data: extrato }, { data: buscas }, { data: authUser }] = await Promise.all([
    saldoCreditos(id),
    supabaseAdmin.from('credit_ledger').select('delta, motivo, criado_em, referencia_tipo, referencia_id')
      .eq('user_id', id).order('criado_em', { ascending: false }).limit(20),
    supabaseAdmin.from('searches').select('nicho, regiao, qtd_solicitada, qtd_entregue, status, criado_em')
      .eq('user_id', id).order('criado_em', { ascending: false }).limit(20),
    supabaseAdmin.auth.admin.getUserById(id).then(r => r.data, () => null),
  ]);

  const bannedUntil = authUser?.user?.banned_until ?? null;
  const bloqueado = !!bannedUntil && new Date(bannedUntil) > new Date();

  res.json({ ...perfil, saldo, bloqueado, extrato: extrato ?? [], buscas: buscas ?? [] });
});

/* ── POST /api/admin/usuarios/:id/bloquear e /desbloquear (história 6.1) ── */
app.post('/api/admin/usuarios/:id/bloquear', exigirAdmin, validar(adminUsuarioIdParamSchema, 'params'), async (req, res) => {
  const { id } = req.params;
  if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode bloquear a própria conta.' });

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: BAN_PERMANENTE });
  if (error) return res.status(500).json({ erro: `Falha ao bloquear: ${error.message}` });
  res.json({ ok: true, bloqueado: true });
});

app.post('/api/admin/usuarios/:id/desbloquear', exigirAdmin, validar(adminUsuarioIdParamSchema, 'params'), async (req, res) => {
  const { id } = req.params;

  const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: 'none' });
  if (error) return res.status(500).json({ erro: `Falha ao desbloquear: ${error.message}` });
  res.json({ ok: true, bloqueado: false });
});

/* ── PATCH /api/admin/usuarios/:id/papel ── promove/rebaixa admin (história 6.1) */
app.patch(
  '/api/admin/usuarios/:id/papel',
  exigirAdmin,
  validar(adminUsuarioIdParamSchema, 'params'),
  validar(adminPapelBodySchema, 'body'),
  async (req, res) => {
    const { id } = req.params;
    if (id === req.usuario.id) return res.status(400).json({ erro: 'Você não pode alterar o próprio papel.' });

    const { error } = await supabaseAdmin.from('profiles').update({ role: req.body.role }).eq('id', id);
    if (error) return res.status(500).json({ erro: `Falha ao alterar papel: ${error.message}` });
    res.json({ ok: true, role: req.body.role });
  }
);

// Confirmação de compras Pix — etapa 1 da história 2.5 (admin confirma
// manualmente). A fila/UI bonita no painel admin é a história 6.3; por ora
// são só endpoints JSON, chamáveis com o token de um usuário role=admin.
app.get('/api/admin/compras/pendentes', exigirAdmin, async (_req, res) => {
  const { data, error } = await supabaseAdmin
    .from('purchases')
    .select('id, user_id, pacote, creditos, valor_centavos, criado_em')
    .eq('status', 'pendente')
    .order('criado_em', { ascending: true });
  if (error) return res.status(500).json({ erro: error.message });
  res.json(data);
});

app.post('/api/admin/compras/:id/confirmar', exigirAdmin, validar(compraIdParamSchema, 'params'), async (req, res) => {
  const { error } = await supabaseAdmin.rpc('confirmar_compra', { p_purchase_id: req.params.id });
  if (error) return res.status(400).json({ erro: error.message });
  res.json({ ok: true });
});

/* ── Handler de erro global (história 5.1) — pega qualquer exceção não
   tratada num handler async (Express 5 encaminha rejeições automaticamente),
   loga com stack trace e nunca vaza detalhe interno pro cliente. ── */
app.use((err, req, res, _next) => {
  logger.error({ err, rota: req.route?.path ?? req.originalUrl }, 'erro não tratado');
  if (res.headersSent) return;
  res.status(500).json({ erro: 'Erro interno no servidor.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, `Interface web disponível em http://localhost:${PORT}`);
  if (!configurado) {
    logger.warn('SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ausentes no .env — as rotas /api responderão 503. Veja supabase/README.md.');
  }
});
