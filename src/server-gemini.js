require('dotenv').config();
const express = require('express');
const path    = require('path');
const { executarAgente } = require('./agent-gemini');

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'sua_chave_aqui') {
  console.error('\n❌ GEMINI_API_KEY não configurada no .env\n');
  console.error('   Obtenha sua chave GRATUITA em: https://aistudio.google.com/apikey\n');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const sessoes = new Map();

app.post('/api/iniciar', (req, res) => {
  const { nicho, regiao, quantidade } = req.body;

  if (!nicho?.trim() || !regiao?.trim() || !quantidade) {
    return res.status(400).json({ erro: 'Preencha todos os campos.' });
  }

  const qty = parseInt(quantidade, 10);
  if (isNaN(qty) || qty < 1 || qty > 50) {
    return res.status(400).json({ erro: 'Quantidade deve ser entre 1 e 50.' });
  }

  const sessionId = `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  sessoes.set(sessionId, { eventos: [], clientes: new Set(), arquivo: null });

  res.json({ sessionId });

  const emit = (tipo, dados) => {
    const sessao = sessoes.get(sessionId);
    if (!sessao) return;
    const evento  = { tipo, dados, ts: Date.now() };
    sessao.eventos.push(evento);
    const payload = `data: ${JSON.stringify(evento)}\n\n`;
    sessao.clientes.forEach(c => { try { c.write(payload); } catch {} });
  };

  executarAgente(nicho.trim(), regiao.trim(), qty, emit)
    .then(resultado => {
      const sessao = sessoes.get(sessionId);
      if (sessao && resultado?.arquivo) sessao.arquivo = resultado.arquivo;
      emit('fim', { totalLeads: resultado?.totalLeads ?? 0, arquivo: resultado?.arquivo ?? null });
    })
    .catch(err => {
      emit('erro', { mensagem: err.message });
    });
});

app.get('/api/eventos/:id', (req, res) => {
  const sessao = sessoes.get(req.params.id);
  if (!sessao) return res.status(404).end();

  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  sessao.eventos.forEach(e => res.write(`data: ${JSON.stringify(e)}\n\n`));
  sessao.clientes.add(res);

  req.on('close', () => sessao.clientes.delete(res));
});

app.get('/api/download/:id', (req, res) => {
  const sessao = sessoes.get(req.params.id);
  if (!sessao?.arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado.' });
  res.download(sessao.arquivo);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\n🚀 [Gemini] Interface web disponível em: http://localhost:${PORT}\n`);
});
