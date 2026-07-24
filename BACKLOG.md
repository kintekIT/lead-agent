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
- [x] ✅ 3.3 — Expansão do dicionário de sinônimos CNAE
- [x] ✅ 3.4 — Qualidade dos resultados (matriz, telefone-lixo, email genérico, colunas extras)

## Fase 3 — Operação

### Épico 4 — Segurança
- [x] ✅ 4.1 — Hardening HTTP básico (helmet, CORS, rate limit)
- [x] ✅ 4.2 — Validação de entrada (zod)
- [ ] ⬜ 4.3 — Rate limiting por usuário + antifraude do trial — *depende de: 0.3 ✅*
- [x] 🟡 4.4 — Segregação de chaves e RLS — *depende de: 0.2 ✅* — RLS e chaves já corretas, falta só o teste explícito de acesso cruzado (usuário A lendo dado do B)
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
- [ ] ⬜ 7.1 — Provisionar VPS com hardening
- [ ] ⬜ 7.2 — Deploy da aplicação + upload do receita.db — *depende de: 7.1 ⬜*
- [ ] ⬜ 7.3 — Domínio + Caddy + HTTPS — *depende de: 7.2 ⬜*
- [ ] ⬜ 7.4 — CI/CD — deploy automático — *depende de: 7.2 ⬜*
- [ ] ⬜ 7.5 — Backups e limpeza de arquivos
- [ ] ⬜ 7.6 — Atualização mensal da base da Receita — *depende de: 7.2 ⬜*

### Épico 8 — Frontend do Produto
- [x] ✅ 8.1 — Fluxo autenticado na interface — *depende de: 0.1 ✅, 1.1 ✅, 1.2 ✅*
- [x] ✅ 8.2 — Saldo no header + feedback de consumo — *depende de: 2.2 ✅*
- [x] ✅ 8.3 — Telas de planos, conta e histórico — *depende de: 1.5 ✅, 3.2 ✅* — telas existem, navegação unificada (`public/js/nav.js`) e a 3.2 (dependência que faltava) fechou na mesma sessão
- [x] 🟡 8.4 — Erros amigáveis e estados vazios — sugestões de nicho e CTA de saldo zero existem; não é sistemático em toda a interface

---

## Pendências transversais (não são história, mas bloqueiam produção)

- **Resend sem domínio verificado**: só entrega e-mail pro dono da própria conta (`kintekit@gmail.com`). Cadastro de qualquer outro usuário falha com 500 até resolver (verificar domínio, ou desativar SMTP customizado temporariamente, ou desligar "Confirm email" em dev). Achado em 2026-07-23.
- **Preços dos pacotes de crédito são placeholder** (`src/config/pacotes-creditos.js`) — decisão de negócio dos sócios, não validar como definitivo.
- **Migrations aplicadas manualmente**: não há credencial de banco direta neste ambiente de dev, só chaves de API — toda migration nova precisa ser colada no SQL Editor do dashboard Supabase por um humano. Ver `supabase/README.md` para a lista em ordem.

## Próximos passos sugeridos (na ordem que fazem mais sentido)

1. Resolver a pendência do Resend (bloqueia testar cadastro de usuários reais)
2. Configurar `PIX_CHAVE` real (fecha o Épico 2 de vez)
3. Ver uma compra Pix de verdade passar pela fila (fecha a 6.3 — Épico 6 inteiro ✅ depois disso)
4. Épico 7 (deploy) — Épico 6 já está fechado em código e validado; falta só a validação acima antes de ir pra produção
