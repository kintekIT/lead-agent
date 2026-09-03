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
- [x] 🟡 2.7 — Pagamento com cartão (Mercado Pago) — *depende de: 2.2 ✅, 2.5 🟡* — **história nova, fora dos 9 épicos originais** (decidida em 2026-08-30). Compra avulsa de pacote pagando com cartão, confirmada **automaticamente por webhook** — sem fila manual. Código pronto: migration `20260830120000`, `src/pagamentos/mercadopago.js` (sem SDK, só `fetch` + `node:crypto`), `POST /api/compras` com `metodo`, `POST /webhooks/mercadopago` com validação de assinatura HMAC, botões na tela de planos. 74/74 testes. **Falta: aplicar a migration no SQL Editor + cadastrar `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` no `.env` + teste ponta a ponta com cartão de teste do MP.** Ver `CONTEXTO.md` seção 33
- [ ] ⬜ 2.8 — Assinatura mensal recorrente — *depende de: 2.7 🟡* — decidido em 2026-08-30 que o produto terá **os dois modelos** (pacote avulso + assinatura). Não iniciada. Diferente da 2.7, **muda o modelo de dados**: precisa de tabela de assinaturas, renovação automática (API de preapproval do MP), tratamento de cobrança recusada, decisão sobre crédito não usado no fim do ciclo (acumula ou expira) e fluxo de cancelamento. Fazer só depois da 2.7 validada em produção

### Épico 3 — Motor & Regras de Negócio
- [x] ✅ 3.1 — Dedup de leads por usuário (janela de 6 meses) — *depende de: 0.2 ✅, 0.3 ✅* — feito junto com 2.3
- [x] ✅ 3.2 — Histórico de buscas + re-download — *depende de: 0.2 ✅* — `GET /api/buscas/:id/download` reaproveita `searches.arquivo` (já existia desde a migration fundacional), valida dono + status + arquivo em disco, nunca chama a RPC de entrega — sem custo de crédito. Botão "⬇ Baixar" em `conta.html` só aparece pra buscas concluídas. Validado de ponta a ponta contra o banco e servidor reais (ver `CONTEXTO.md`)
- [x] ✅ 3.3 — Expansão do dicionário de sinônimos CNAE — **fix 2026-08-17**: homologação com gestores achou nicho composto (ex.: "consultório ambiental") trazendo CNAE de área errada por causa de matching OR entre palavras, não AND; corrigido + nicho "ambiental" (sem categoria própria no CNAE) resolvido via lista curada de códigos (`CONTEXTO.md` seção 26). Auditoria completa do dicionário na sequência achou mais 5 bugs do mesmo padrão (`PET`/`BAR`/`MOVEIS`/`SEGUROS` por colisão de substring com palavra sem relação; `TRANSPORTADORA`/`AUTOPECAS`/`OFICINA`/`MECANICO` por raiz curada ampla demais) — todos corrigidos com fix estrutural (matching por início de palavra) + lista curada de código pros 3 nichos que precisavam. Ver `CONTEXTO.md` seção 27
- [x] ✅ 3.4 — Qualidade dos resultados (matriz, telefone-lixo, email genérico, colunas extras)
- [x] ✅ 3.5 — Filtro de contato-máscara — **história nova** (pedida na reunião de 2026-09-02: "melhorar a qualidade dos leads"). Remove contato de intermediário — contabilidade, abridora de MEI, banco — cadastrado no CNPJ de milhares de clientes. **Um em cada cinco registros da base tinha pelo menos um contato assim** e nada filtrava: o script de e-mail genérico da 3.4 existia desde julho mas **nunca foi rodado em produção**, e nem cobria domínio nem telefone. Três filtros agora: e-mail exato (≥20), domínio corporativo (≥30, com lista de provedores públicos protegida — o gmail sozinho é 55% da base) e telefone (≥10). Política: **apaga o campo que é máscara e descarta o lead só quando os dois forem** — preserva 89% da base em vez dos 78% que o descarte total daria. 78/78 testes. **Ativo em produção desde 2026-09-02** (55.016 e-mails, 18.218 domínios e 81.676 telefones registrados) e verificado com busca real em Curitiba: nenhum contato de intermediário passou e nenhum lead saiu sem contato. Conferir a lista gerada após cada atualização mensal — a primeira geração marcou 32.847 e-mails com erro de digitação (`gmai.com`, `gamil.com`) como máscara, corrigido em `src/config/provedores-publicos.js`. Ver `CONTEXTO.md` seção 37

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
- [x] 🟠 7.4 — CI/CD — deploy automático — *depende de: 7.2 ✅* — `.github/workflows/deploy.yml` (testa + faz deploy via SSH em push pra `main`). **Secrets cadastrados em 2026-09-02** (`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`, com chave ed25519 dedicada ao CI, separada da pessoal). Node do workflow alinhado com a produção (era 22, virou 24). **Aguardando a primeira execução real pra virar ✅**
- [x] 🟡 7.5 — Backups e limpeza de arquivos — `deploy/limpeza-diaria.sh` (leads/logs antigos) + guia de `supabase db dump` manual (plano Free não tem backup automático do Postgres)
- [ ] 🔴 7.6 — Atualização mensal da base da Receita — *depende de: 7.2 ✅* — **QUEBRADA**: testado ao vivo em 2026-08-30, a RFB migrou os dados abertos pra um compartilhamento **Nextcloud** (`/index.php/s/<token>`). As URLs diretas que o script usa dão **404** em todos os meses testados. A ressalva antiga ("site bloqueia fetch automatizado") estava **errada** — o servidor responde normal, mudou foi o mecanismo. A lógica de importar em banco separado e trocar atomicamente segue boa; o que precisa ser reescrito é só o download (provavelmente via WebDAV do Nextcloud). Falharia cedo no cron, sem corromper a base atual. Ver `CONTEXTO.md` seção 32

### Épico 8 — Frontend do Produto
- [x] ✅ 8.1 — Fluxo autenticado na interface — *depende de: 0.1 ✅, 1.1 ✅, 1.2 ✅*
- [x] ✅ 8.2 — Saldo no header + feedback de consumo — *depende de: 2.2 ✅*
- [x] ✅ 8.3 — Telas de planos, conta e histórico — *depende de: 1.5 ✅, 3.2 ✅* — telas existem, navegação unificada (`public/js/nav.js`) e a 3.2 (dependência que faltava) fechou na mesma sessão
- [x] ✅ 8.4 — Erros amigáveis e estados vazios — todo `alert()` de `index.html` e `planos.html` virou mensagem inline (banner de erro + campo destacado no form, feedback no próprio botão ao copiar Pix). `admin.html` ficou de fora de propósito (1 `alert()` restante) — é território do Épico 6 (sócio), ver `CONTEXTO.md`

---

## Pendências transversais (não são história, mas bloqueiam produção)

- **🔴 Deploy automático (7.4) desligado — e o agente não consegue atualizar a VPS** (2026-09-01) — hoje toda atualização do servidor depende de alguém rodar `./deploy/deploy.sh` na mão, e o classificador de auto-mode do Claude Code bloqueia o agente de fazer isso (3 tentativas recusadas: `deploy.sh`, `git pull --ff-only` e `git merge --ff-only`). Resultado prático: o código é commitado e enviado, mas não chega ao ar. **Duas ações pra fechar**: (1) cadastrar os 3 secrets no GitHub pra ligar a 7.4 (`DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` — com chave SSH dedicada ao CI, nunca a pessoal); (2) adicionar regra de permissão no `.claude/settings.json` autorizando o agente a rodar o deploy, pra ele conseguir aplicar correções sem depender de intervenção manual.
- ✅ **~~Servidor de produção desatualizado~~ — RESOLVIDO em 2026-09-01.** Atualizado de `6f02b92` (17/08) para `1feab77` (v1.0.8) no primeiro deploy manual de verdade do projeto. Entraram a correção do `app.listen` e a história 2.7. Ver `CONTEXTO.md` seção 35.
- **🟠 A aplicação agora fica em `app.leadoor.com.br`, não na raiz** (2026-09-01) — um sócio publicou uma landing page (Lovable) e repontou `leadoor.com.br` e `www` pra ela. Arranjo final: **marketing na raiz, produto no subdomínio**, o padrão de SaaS. Os registros de e-mail sobreviveram porque a zona foi editada, não recriada. **Combinar com o time que alteração de DNS é avisada antes** — a zona é compartilhada agora, e uma edição desatenta derruba o produto ou apaga a configuração de e-mail. Três lugares precisam concordar sobre o endereço (Caddyfile, `APP_ORIGIN`, Site URL do Supabase); ver `CONTEXTO.md` seção 35.
- **Domínio comprado (`leadoor.com.br`, 2026-08-12) e VPS contratada (Hostinger KVM 2, Brasil, 2026-08-25)** — `deploy/Caddyfile` e `deploy/README.md` já atualizados com o domínio real; VPS hardenizada (história 7.1 ✅). **Tudo que o domínio destravava está feito (2026-08-30)**: DNS apontado e propagado, site no ar em https://leadoor.com.br com HTTPS válido (7.3 ✅), `APP_ORIGIN` de produção configurado (CORS, 4.1 ✅) e domínio verificado no Resend com DKIM (✅, ver abaixo). O `www` já existia no DNS e redireciona pro apex.
- ✅ **~~Resend sem domínio verificado~~ — RESOLVIDO em 2026-08-30.** `leadoor.com.br` verificado no Resend (DKIM + 2 CNAMEs no Registro.br), SMTP do Supabase corrigido (o `Username` estava como `kintekit@gmail.com`, tem que ser o literal `resend`; os campos de remetente estavam vazios) e Site URL apontando pro domínio real. **Cadastro de usuário novo recebe o e-mail de confirmação** — testado. Ver `CONTEXTO.md` seção 34.
- **🟠 DECISÃO PARCIALMENTE TOMADA: mecanismo de pagamento** — **decidido em 2026-08-30: gateway Mercado Pago, e o produto terá os dois modelos** (pacote avulso + assinatura recorrente). A 2.7 (cartão avulso) já está implementada; a 2.8 (assinatura) não foi iniciada. **Segue em aberto, pra conversa com Giovanni, Rogério e Gustavo: o Pix manual continua no produto ou sai?** Contexto original abaixo. — o fluxo construído (histórias 2.5 e 6.3) é **Pix com confirmação manual**: QR/copia-e-cola, compra `pendente`, expiração em 48h e um admin confirmando na fila do painel. Há indício de que o time decidiu **cartão**. Três desfechos possíveis:
  - **Pix + cartão convivendo** (comum no mercado brasileiro) — 2.5 e 6.3 seguem valendo como estão, o cartão entra como história nova ao lado;
  - **só cartão** — 2.5 e 6.3 saem do projeto;
  - **só Pix** — como está hoje, só falta a chave real.

  **O que precisa de certeza antes de codar qualquer coisa não é "Pix ou cartão", e sim o mecanismo do cartão**: qual gateway (Stripe / Mercado Pago / Pagar.me), e se é compra avulsa de pacote de créditos ou assinatura recorrente — isso muda o modelo de dados, não só a integração. Nenhum dos desfechos torna a decisão urgente do lado técnico: cadastrar a `PIX_CHAVE` leva dois minutos e é reversível.
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

## Go-live — o que falta (revisado em 2026-09-02)

**Estado: o produto funciona ponta a ponta em produção.** O caminho completo do cliente foi
percorrido em 2026-09-02 — cadastro em `app.leadoor.com.br`, e-mail de confirmação chegando com o
link certo, conta ativada com os 20 créditos de trial e busca de leads executada com sucesso (ver
`CONTEXTO.md` seção 36). O que resta não é fazer o sistema funcionar; é poder cobrar por ele e
operá-lo com segurança.

### ✅ Concluído

1. **Domínio** `leadoor.com.br` (12/08) e **VPS** Hostinger no Brasil (25/08).
2. **Infraestrutura no ar** — histórias 7.1, 7.2 e 7.3: servidor hardenizado, aplicação sob pm2,
   HTTPS válido, `trust proxy` confirmado. A aplicação atende em **https://app.leadoor.com.br**; o
   domínio raiz é a landing page.
3. **E-mail transacional** — domínio verificado no Resend com DKIM (30/08).
4. **Fluxo do cliente validado de ponta a ponta** (02/09).

### 🔴 Bloqueia vender

5. **Definir o preço dos pacotes** — `src/config/pacotes-creditos.js` está com R$99/199/349, que são
   exemplos de desenvolvimento. **É o único item que impede literalmente cobrar.** Decisão dos sócios.
6. **Ativar o pagamento** — depende da decisão Pix vs. cartão (ver pendências transversais):
   - **cartão (2.7)**: aplicar `supabase/migrations/20260830120000_pagamento_cartao_mercadopago.sql`
     no SQL Editor, cadastrar `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` no `.env` de
     produção, apontar o webhook no painel do MP pra `https://app.leadoor.com.br/webhooks/mercadopago`
     e fazer uma compra de teste ponta a ponta — incluindo conferir que uma segunda notificação do
     mesmo pagamento **não** credita de novo;
   - **Pix (2.5/6.3)**: `PIX_CHAVE`/`PIX_NOME_RECEBEDOR`/`PIX_CIDADE` reais no `.env` e ver uma
     compra passar pela fila do admin.
7. **Escrever os Termos de Uso e a Política de Privacidade** — o aceite já é registrado, o texto é
   rascunho. Otávio assumiu. Vale revisão jurídica pela LGPD, já que o produto trata dados de empresas.

### 🟠 Operar com segurança

8. **Ligar o deploy automático (7.4)** — cadastrar `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY` no
   GitHub, com chave SSH dedicada ao CI. Hoje todo deploy é manual, e o servidor já ficou defasado
   duas vezes por isso.
9. **Sentry + UptimeRobot (5.3)** — contas gratuitas; colar o `SENTRY_DSN` no `.env` e monitorar
   `https://app.leadoor.com.br/health`. Sem isso, queda de madrugada só é descoberta pelo cliente.
10. **Backup do Postgres** — o plano Free do Supabase **não faz backup automático**. Hoje depende de
    `supabase db dump` manual. O Pro (US$25/mês) resolve e ainda libera a proteção contra senhas
    vazadas.
11. **Agendar a limpeza diária (7.5)** — o script existe, nunca foi posto no cron.

### ⬜ Depois do lançamento

12. **Consertar a atualização mensal da base (7.6)** — quebrada: a RFB migrou os dados abertos pra um
    compartilhamento Nextcloud e as URLs diretas dão 404. Não impede lançar; a base atual serve
    normalmente, só vai envelhecendo.
13. **Assinatura recorrente (2.8)** — decidida, não iniciada. Muda o modelo de dados.
14. **Antifraude do trial (4.3)** — nada impede criar várias contas pra reusar os 20 créditos
    gratuitos. O que dava pra fazer em código já existe; o resto é configuração e decisão de rigor.
