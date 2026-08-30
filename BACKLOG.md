# Backlog de Produção — lead-agent

Checklist vivo das 9 épicos / 41 histórias do plano de produção. Espelha o
backlog original (artifact `73e7f80e-504d-459b-b720-00e1185a7fdb`, ver
`CONTEXTO.md` seção 8), mas este arquivo é a fonte de verdade sobre o que
**já está pronto** — o artifact é a foto do dia em que foi escrito, este
arquivo evolui com o código.

**Convenção de status:** ✅ pronto e validado · 🟡 parcial/pendência conhecida · 🟠 em progresso por alguém agora · ⬜ não iniciado

Sempre que uma história for concluída: marcar aqui, e acrescentar uma
entrada datada em `CONTEXTO.md` explicando o quê/como/por quê. Sempre que
começar a trabalhar em algo, ler este arquivo primeiro pra saber o estado
real antes de assumir qualquer coisa.

**Antes de criar uma branch nova para uma história**: rodar
`git fetch kintekit --prune` e `git branch -a | grep -i "<número>"` — o
sócio pré-cria (e às vezes já preenche) branches `feature/{número}-*` pra
histórias futuras. Em 2026-07-23 existiam branches vazias (só reserva de
nome) pra quase todo o backlog restante (3.2, 4.3, 4.5, 5.1-5.4, 6.2-6.4,
7.1-7.6, 8.3-8.4) e uma com nome ligeiramente diferente do que usei pra
2.5 (`feature/2.5-planos-compra-pix`, vazia — a 2.5 real foi mergeada via
`feature/2.5-pix-planos`, pode apagar a duplicata vazia quando for
conveniente).

---

## Fase 1 — Fundação

### Épico 0 — Fundação técnica Supabase
- [x] ✅ 0.1 — Criar e configurar o projeto Supabase
- [x] ✅ 0.2 — Modelagem do banco de usuários e créditos
- [x] ✅ 0.3 — Middleware de autenticação no Express — *depende de: 0.1 ✅*

### Épico 1 — Contas & Acesso
- [x] ✅ 1.1 — Cadastro com confirmação de email — *depende de: 0.1 ✅*
- [x] ✅ 1.2 — Tela de login e logout
- [x] ✅ 1.3 — Recuperação de senha
- [x] ✅ 1.4 — Perfis e permissões: free, premium e admin — *depende de: 0.2 ✅, 0.3 ✅*
- [x] ✅ 1.5 — Página "Minha Conta"

## Fase 2 — Monetização

### Épico 2 — Créditos & Monetização
- [x] ✅ 2.1 — Trial: 20 créditos no cadastro — *depende de: 1.1 ✅, 2.2 ✅*
- [x] ✅ 2.2 — Saldo e extrato de créditos — *depende de: 0.2 ✅*
- [x] ✅ 2.3 — Débito atômico por lead entregue — *depende de: 0.2 ✅, 3.1 ✅*
- [x] ✅ 2.4 — Prévia pré-consumo — *depende de: 3.1 ✅*
- [x] 🟡 2.5 — Página de planos + compra via Pix — *depende de: 2.2 ✅, 6.3 🟡* — **código pronto, falta `PIX_CHAVE`/`PIX_NOME_RECEBEDOR`/`PIX_CIDADE` reais no `.env` pra funcionar de verdade**
- [x] ✅ 2.6 — Saldo zerado → volta a free — *depende de: 2.2 ✅*

### Épico 3 — Motor & Regras de Negócio
- [x] ✅ 3.1 — Dedup de leads por usuário (janela de 6 meses) — *depende de: 0.2 ✅, 0.3 ✅* — feito junto com 2.3
- [x] ✅ 3.2 — Histórico de buscas + re-download — *depende de: 0.2 ✅* — `GET /api/buscas/:id/download` reaproveita `searches.arquivo` (já existia desde a migration fundacional), valida dono + status + arquivo em disco, nunca chama a RPC de entrega — sem custo de crédito. Botão "⬇ Baixar" em `conta.html` só aparece pra buscas concluídas. Validado de ponta a ponta contra o banco e servidor reais (ver `CONTEXTO.md`)
- [x] ✅ 3.3 — Expansão do dicionário de sinônimos CNAE — **fix 2026-08-17**: homologação com gestores achou nicho composto (ex.: "consultório ambiental") trazendo CNAE de área errada por causa de matching OR entre palavras, não AND; corrigido + nicho "ambiental" (sem categoria própria no CNAE) resolvido via lista curada de códigos (`CONTEXTO.md` seção 26). Auditoria completa do dicionário na sequência achou mais 5 bugs do mesmo padrão (`PET`/`BAR`/`MOVEIS`/`SEGUROS` por colisão de substring com palavra sem relação; `TRANSPORTADORA`/`AUTOPECAS`/`OFICINA`/`MECANICO` por raiz curada ampla demais) — todos corrigidos com fix estrutural (matching por início de palavra) + lista curada de código pros 3 nichos que precisavam. Ver `CONTEXTO.md` seção 27
- [x] ✅ 3.4 — Qualidade dos resultados (matriz, telefone-lixo, email genérico, colunas extras)

## Fase 3 — Operação

### Épico 4 — Segurança
- [x] ✅ 4.1 — Hardening HTTP básico (helmet, CORS, rate limit)
- [x] ✅ 4.2 — Validação de entrada (zod)
- [x] 🟡 4.3 — Rate limiting por usuário + antifraude do trial — *depende de: 0.3 ✅* — rate limit por usuário (`limitePorUsuario`, `src/middleware/seguranca.js`) em `/api/iniciar` e `/api/previa`, validado contra o servidor real. Antifraude do trial contra múltiplas contas segue 🟡: o cadastro (`sb.auth.signUp`) roda direto no navegador contra o Supabase Auth, sem passar pelo nosso backend — não tem código nosso pra travar aí. O que dava pra fazer em código já existia (índice único que impede o mesmo `user_id` receber trial duas vezes, história 2.1). O resto é config do dashboard Supabase, não código — ver `CONTEXTO.md`
- [x] ✅ 4.4 — Segregação de chaves e RLS — *depende de: 0.2 ✅* — RLS já estava correto desde a 0.2; validado de ponta a ponta contra o banco real com duas contas de verdade (leitura e escrita cruzadas bloqueadas em `profiles`, `credit_ledger`, `searches`, `purchases`, `delivered_leads` — ver `CONTEXTO.md`)
- [x] 🟡 4.5 — Termos de Uso + Política de Privacidade (LGPD) — `termos.html` existe, aceite é registrado no cadastro, mas o texto ainda é placeholder

### Épico 5 — Observabilidade & Logs
- [x] ✅ 5.1 — Logger estruturado + log de toda requisição
- [x] ✅ 5.2 — Rotação e retenção de logs
- [x] 🟡 5.3 — Alertas de erro e uptime — código pronto (Sentry condicional a `SENTRY_DSN`, endpoint `/health`), mas falta ação manual do usuário: criar conta free no Sentry (colar o DSN no `.env`) e cadastrar a URL pública no UptimeRobot (ou similar) apontando pra `/health` — isso é 100% configuração externa, não tem mais nada de código
- [x] ✅ 5.4 — Auditoria de eventos de negócio — *depende de: 0.2 ✅* — migration aplicada e validada de ponta a ponta com conta admin real (`GET /api/admin/eventos` responde 200). Escopo restrito a ações administrativas — searches/credit_ledger/purchases já cobrem a trilha de busca/consumo/compra de forma estruturada, não duplicado em `events`

### Épico 6 — Painel Admin
**🙋 Responsável: sócio (Gustavo).** Não iniciar história nova aqui sem alinhar com ele primeiro — mesmo que a dependência esteja pronta.
- [x] ✅ 6.1 — Gestão de usuários — *depende de: 0.3 ✅, 1.4 ✅* — lista com busca por email + paginação, detalhe (saldo/extrato/buscas), bloquear/desbloquear (`supabaseAdmin.auth.admin.updateUserById`) e alterar papel, tudo em `public/admin.html` + rotas `GET/POST/PATCH /api/admin/usuarios*`. Reconciliada 3x contra a main enquanto os Épicos 2.5 e 5 avançavam em paralelo — nenhum conflito de lógica, só imports/headers concatenados.
- [x] ✅ 6.2 — Créditos manuais (atribuir/estornar) — *depende de: 2.2 ✅, 5.4 ✅* — formulário no `admin.html` (delta +/-, motivo obrigatório), `POST /api/admin/usuarios/:id/creditos` grava em `credit_ledger` (motivo `ajuste`) e audita em `events` (`ajuste_credito`, com delta/motivo nos metadados). Validado de ponta a ponta contra o banco real: crédito, estorno, trava de saldo insuficiente (409, via `trg_impedir_saldo_negativo` da história 2.3) e evento de auditoria gravado
- [x] 🟡 6.3 — Fila de confirmação de compras Pix — *depende de: 2.5 🟡* — UI em `public/admin.html` (tabela com email/pacote/valor/prazo, botão Confirmar) + expiração automática de 48h (`expirarComprasPendentes()`, roda antes de qualquer leitura de compras). Falta só teste ponta a ponta com uma compra pendente de verdade (nenhuma existe no banco agora) — a query com join `profiles(email)` e o `UPDATE` de expiração já rodaram contra o banco real sem erro, e já existe conta admin real pra testar (5.4/6.1)
- [x] ✅ 6.4 — Métricas do negócio — *depende de: 5.4 ✅* — migration `20260723170000_metricas_negocio.sql` aplicada pelo sócio; validada de ponta a ponta com token de admin real (`GET /api/admin/metricas` responde 200 com dados de verdade: 3 trials, 47 créditos consumidos, "Academia" é o nicho mais buscado). Painel com stat tiles + gráfico de barras (novos usuários/dia, buscas/dia) + ranking de nichos em `admin.html`

## Fase 4 — Produção

### Épico 7 — Infraestrutura & Deploy
**VPS contratada e 7.1 validada contra infra real em 2026-08-25** (Hostinger KVM 2, Brasil — 11ms de latência, `179.199.132.111`, `srv1928301.hstgr.cloud`, domínio `leadoor.com.br`). Demais histórias ainda usam scripts prontos em `deploy/` não rodados de verdade. Ver `CONTEXTO.md` seção 28 para o relato completo.
- [x] ✅ 7.1 — Provisionar VPS com hardening — `deploy/setup-vps.sh` rodado e validado no servidor real: usuário `deploy` (sudo via regra `NOPASSWD` específica — segura porque o único caminho até esse usuário é a chave SSH; **aplicada na mão, o `setup-vps.sh` ainda não faz esse passo**), SSH só-chave (root desabilitado, confirmado), UFW (22/80/443), fail2ban ativo (achado curioso: baniu o próprio IP do operador durante o teste de que root estava bloqueado — resolvido via console do navegador), Node v24.19.0 + pm2 7.0.4, swap 2GB, timezone São Paulo
- [x] ✅ 7.2 — Deploy da aplicação + upload do receita.db — *depende de: 7.1 ✅* — **executada de verdade em 2026-08-29**: repo clonado (`kintekIT/lead-agent`, público, commit `6f02b92`), `npm ci --omit=dev` com `better-sqlite3` compilando OK, banco transferido como zip de 4,3GB via `sftp` (validado byte a byte + consulta real: 68,6M empresas), `.env` de produção com `APP_ORIGIN` real, app sob pm2 com `pm2 startup` registrado no systemd. Validado por dentro: `/health` 200, `/` 200, `/api/me` 401. Ver `CONTEXTO.md` seção 30
- [x] ✅ 7.3 — Domínio + Caddy + HTTPS — *depende de: 7.2 ✅* — **no ar em 2026-08-30: https://leadoor.com.br com certificado válido**. Caddy v2.11.4, HTTP→HTTPS (308), `www`→apex (301, obrigatório porque o `www` já existia no DNS e porque o CORS exige origem canônica), `/api/me` 401. `trust proxy` confirmado em produção (`x-forwarded-for` com IP real do visitante). Achados: `sudo caddy validate` cria o log como root e faz o reload seguinte falhar; `tls-alpn-01` falhou na validação secundária e o Caddy caiu sozinho pro `http-01`. Ver `CONTEXTO.md` seção 31
- [x] 🟡 7.4 — CI/CD — deploy automático — *depende de: 7.2 ✅* — `.github/workflows/deploy.yml` (testa + faz deploy via SSH em push pra `main`); nunca rodou de verdade, falta cadastrar os secrets no GitHub
- [x] 🟡 7.5 — Backups e limpeza de arquivos — `deploy/limpeza-diaria.sh` (leads/logs antigos) + guia de `supabase db dump` manual (plano Free não tem backup automático do Postgres)
- [ ] 🔴 7.6 — Atualização mensal da base da Receita — *depende de: 7.2 ✅* — **QUEBRADA**: testado ao vivo em 2026-08-30, a RFB migrou os dados abertos pra um compartilhamento **Nextcloud** (`/index.php/s/<token>`). As URLs diretas que o script usa dão **404** em todos os meses testados. A ressalva antiga ("site bloqueia fetch automatizado") estava **errada** — o servidor responde normal, mudou foi o mecanismo. A lógica de importar em banco separado e trocar atomicamente segue boa; o que precisa ser reescrito é só o download (provavelmente via WebDAV do Nextcloud). Falharia cedo no cron, sem corromper a base atual. Ver `CONTEXTO.md` seção 32

### Épico 8 — Frontend do Produto
- [x] ✅ 8.1 — Fluxo autenticado na interface — *depende de: 0.1 ✅, 1.1 ✅, 1.2 ✅*
- [x] ✅ 8.2 — Saldo no header + feedback de consumo — *depende de: 2.2 ✅*
- [x] ✅ 8.3 — Telas de planos, conta e histórico — *depende de: 1.5 ✅, 3.2 ✅* — telas existem, navegação unificada (`public/js/nav.js`) e a 3.2 (dependência que faltava) fechou na mesma sessão
- [x] ✅ 8.4 — Erros amigáveis e estados vazios — todo `alert()` de `index.html` e `planos.html` virou mensagem inline (banner de erro + campo destacado no form, feedback no próprio botão ao copiar Pix). `admin.html` ficou de fora de propósito (1 `alert()` restante) — é território do Épico 6 (sócio), ver `CONTEXTO.md`

---

## Pendências transversais (não são história, mas bloqueiam produção)

- **Domínio comprado (`leadoor.com.br`, 2026-08-12) e VPS contratada (Hostinger KVM 2, Brasil, 2026-08-25)** — `deploy/Caddyfile` e `deploy/README.md` já atualizados com o domínio real; VPS hardenizada (história 7.1 ✅). **DNS apontado e propagado; site no ar em https://leadoor.com.br com HTTPS válido (2026-08-30, história 7.3 ✅)**. O `www` já existia no DNS e agora redireciona pro apex. Ainda falta: (1) verificar o domínio no Resend com SPF/DKIM no DNS, que é o que destrava e-mail pra qualquer usuário que não seja o dono da conta; (2) `APP_ORIGIN` de produção (CORS, história 4.1); (3) HTTPS automático do Caddy (7.3).
- **Resend sem domínio verificado**: só entrega e-mail pro dono da própria conta (`kintekit@gmail.com`). Cadastro de qualquer outro usuário falha com 500 até resolver (verificar domínio, ou desativar SMTP customizado temporariamente, ou desligar "Confirm email" em dev). Achado em 2026-07-23.
- **🔴 DECISÃO EM ABERTO: Pix ou cartão?** (levantado por Otávio em 2026-08-30) — todo o fluxo de pagamento construído (histórias 2.5 e 6.3) pressupõe **Pix com confirmação manual**: geração de QR/copia-e-cola, compra em estado `pendente`, expiração em 48h e um admin confirmando na fila do painel. Otávio suspeita que o time decidiu **pagamento via cartão**, o que **não é uma troca de configuração** — exigiria integrar um gateway (Stripe/Mercado Pago/Pagar.me), tratar webhook de confirmação automática, estorno e falha de cobrança, e tornaria a fila de confirmação manual da 6.3 obsoleta. **Confirmar com o time antes de investir em qualquer um dos dois caminhos** — inclusive antes de cadastrar a `PIX_CHAVE` real, que é trabalho jogado fora se a decisão for cartão.
- **Preços dos pacotes de crédito são placeholder** (`src/config/pacotes-creditos.js`, R$99/199/349) — decisão de negócio dos sócios, não validar como definitivo.
- **Texto dos Termos de Uso / Política de Privacidade é placeholder** (`public/termos.html`, história 4.5) — o aceite já é registrado no cadastro, mas o conteúdo precisa ser escrito/revisado antes de vender pra cliente real. **Otávio assumiu escrever (2026-08-30)** — não é bloqueio técnico, é redação.
- **Leaked password protection desativada** — toggle do dashboard Supabase (Authentication → Providers → Email) que **exige plano Pro**. Confirmado tentando de verdade no plano Free: o toggle marca, mas o save é recusado. Fica bloqueado até decidirem o upgrade — não adianta tentar de novo sem mudar de plano.
- **Migrations — MCP do Supabase conectado (2026-07-25), mas ainda exige aprovação humana por chamada**: `apply_migration` via MCP funciona (usado pra corrigir o bug do `anon`/`confirmar_compra`, ver `CONTEXTO.md` seção 23), mas o classificador de auto-mode do Claude Code bloqueia DDL direto em produção sem confirmação explícita a cada vez — na prática, colar no SQL Editor do dashboard continua sendo o caminho mais direto. Ver `supabase/README.md` para a lista em ordem.

## Custos operacionais (levantamento de 2026-07-26)

| Item | Pra que serve | Custo |
|---|---|---|
| VPS (2 vCPU / 4GB RAM / 60GB disco) | roda a aplicação e hospeda o `receita.db` | ~R$45/mês |
| Domínio `.com.br` (registro.br) | endereço público + DNS pro SPF/DKIM do Resend | R$40/ano |
| HTTPS (Let's Encrypt via Caddy) | certificado TLS | grátis |
| Supabase | Auth + Postgres | Free hoje. Pro = US$25/mês (~R$127) e é o que libera backup diário do Postgres e a leaked password protection |
| Resend | e-mail transacional (confirmação, recuperação de senha) | Free até 3.000/mês. Pago = US$20-35/mês (~R$100-180) |
| Sentry + UptimeRobot (5.3) | stacktrace de erro + monitor de uptime | plano free atende |

**Mínimo pra lançar: ~R$50/mês.** Com Supabase Pro + Resend pago: ~R$280/mês. Câmbio de
referência R$5,08/US$ (26/07/2026) — os itens em dólar variam com a cotação.

## Go-live — ordem sugerida

Cada item diz **o que confirmar** antes de considerar fechado.

1. ✅ **Comprar o domínio** (`leadoor.com.br`, 2026-08-12) — destrava Resend, `APP_ORIGIN` e HTTPS de uma vez só.
2. **Verificar o domínio no Resend** (registros SPF/DKIM no DNS) → confirmar: cadastro de um
   e-mail que **não** seja o `kintekit@gmail.com` recebe a confirmação, e não cai em spam.
3. **⚠️ Antes de mexer em pagamento, resolver a decisão Pix vs. cartão** (ver pendências transversais). Se ficar Pix: `PIX_CHAVE` / `PIX_NOME_RECEBEDOR` / `PIX_CIDADE` reais no `.env` → fecha a 2.5. Se for cartão: 2.5 e 6.3 precisam ser repensadas, não configuradas.
4. **Ver uma compra Pix de verdade passar pela fila do admin** → fecha a 6.3, e com ela o Épico 6
   inteiro.
5. **Escrever o texto real dos Termos de Uso / Política de Privacidade** → fecha a 4.5.
6. **Contratar a VPS e seguir `deploy/README.md` na ordem** — é o que vira as 6 histórias do
   Épico 7 de 🟡 pra ✅:
   - **7.1** — rodar `setup-vps.sh` no servidor de verdade. **Antes de fechar a sessão root**,
     abrir outro terminal e confirmar que `ssh deploy@IP` funciona — se a chave não foi copiada
     certo, você fica trancado pra fora.
   - **7.2** — primeiro deploy manual seguindo o guia (clone → `.env` → `rsync` do `receita.db` →
     `pm2 start`). É o teste real de que `deploy.sh` e `ecosystem.config.js` estão certos.
   - **7.3** — apontar o domínio, confirmar HTTPS de verdade e **testar que o rate limit por IP
     não quebrou**: o `app.set('trust proxy', 1)` é a parte mais fácil de sair errado atrás do
     Caddy (sem ele, todo mundo aparece com o IP do proxy e o limite vira global).
   - **7.4** — cadastrar os 3 secrets no GitHub (`DEPLOY_HOST` / `DEPLOY_USER` /
     `DEPLOY_SSH_KEY`) e ver o primeiro deploy automático rodar sozinho depois de um push na
     `main`.
   - **7.5 / 7.6** — rodar a limpeza e a atualização mensal **manualmente uma vez cada** antes de
     confiar no cron. O 7.6 principalmente: a URL da RFB não deu pra confirmar ao vivo (o site
     bloqueia fetch automatizado), então o dry-run manual é obrigatório.
7. **Sentry + UptimeRobot** (5.3) — só faz sentido depois que existir URL pública: criar conta
   free no Sentry e colar o `SENTRY_DSN` no `.env`; cadastrar `https://<dominio>/health` no
   UptimeRobot com alerta por e-mail/Telegram.
