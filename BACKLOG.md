# Backlog de Produção — lead-agent

Checklist vivo das 9 épicos / 41 histórias do plano de produção. Espelha o
backlog original (artifact `73e7f80e-504d-459b-b720-00e1185a7fdb`, ver
`CONTEXTO.md` seção 8), mas este arquivo é a fonte de verdade sobre o que
**já está pronto** — o artifact é a foto do dia em que foi escrito, este
arquivo evolui com o código.

**Convenção de status:** ✅ pronto e validado · 🟡 parcial/pendência conhecida · ⬜ não iniciado

Sempre que uma história for concluída: marcar aqui, e acrescentar uma
entrada datada em `CONTEXTO.md` explicando o quê/como/por quê. Sempre que
começar a trabalhar em algo, ler este arquivo primeiro pra saber o estado
real antes de assumir qualquer coisa.

---

## Fase 1 — Fundação

### Épico 0 — Fundação técnica Supabase
- [x] ✅ 0.1 — Criar e configurar o projeto Supabase
- [x] ✅ 0.2 — Modelagem do banco de usuários e créditos
- [x] ✅ 0.3 — Middleware de autenticação no Express

### Épico 1 — Contas & Acesso
- [x] ✅ 1.1 — Cadastro com confirmação de email
- [x] ✅ 1.2 — Tela de login e logout
- [x] ✅ 1.3 — Recuperação de senha
- [x] ✅ 1.4 — Perfis e permissões: free, premium e admin
- [x] ✅ 1.5 — Página "Minha Conta"

## Fase 2 — Monetização

### Épico 2 — Créditos & Monetização
- [x] ✅ 2.1 — Trial: 20 créditos no cadastro
- [x] ✅ 2.2 — Saldo e extrato de créditos
- [x] ✅ 2.3 — Débito atômico por lead entregue
- [x] ✅ 2.4 — Prévia pré-consumo
- [x] 🟡 2.5 — Página de planos + compra via Pix — **código pronto, falta `PIX_CHAVE`/`PIX_NOME_RECEBEDOR`/`PIX_CIDADE` reais no `.env` pra funcionar de verdade**
- [x] ✅ 2.6 — Saldo zerado → volta a free

### Épico 3 — Motor & Regras de Negócio
- [x] ✅ 3.1 — Dedup de leads por usuário (janela de 6 meses) — feito junto com 2.3
- [x] 🟡 3.2 — Histórico de buscas + re-download — listagem existe (`conta.html`), re-download dedicado sem debitar de novo não foi construído como endpoint próprio
- [x] ✅ 3.3 — Expansão do dicionário de sinônimos CNAE
- [x] ✅ 3.4 — Qualidade dos resultados (matriz, telefone-lixo, email genérico, colunas extras)

## Fase 3 — Operação

### Épico 4 — Segurança
- [x] ✅ 4.1 — Hardening HTTP básico (helmet, CORS, rate limit)
- [x] ✅ 4.2 — Validação de entrada (zod)
- [ ] ⬜ 4.3 — Rate limiting por usuário + antifraude do trial
- [x] 🟡 4.4 — Segregação de chaves e RLS — RLS e chaves já corretas, falta só o teste explícito de acesso cruzado (usuário A lendo dado do B)
- [x] 🟡 4.5 — Termos de Uso + Política de Privacidade (LGPD) — `termos.html` existe, aceite é registrado no cadastro, mas o texto ainda é placeholder

### Épico 5 — Observabilidade & Logs
- [ ] ⬜ 5.1 — Logger estruturado + log de toda requisição
- [ ] ⬜ 5.2 — Rotação e retenção de logs
- [ ] ⬜ 5.3 — Alertas de erro e uptime
- [ ] ⬜ 5.4 — Auditoria de eventos de negócio

### Épico 6 — Painel Admin
- [ ] ⬜ 6.1 — Gestão de usuários
- [ ] ⬜ 6.2 — Créditos manuais (atribuir/estornar)
- [x] 🟡 6.3 — Fila de confirmação de compras Pix — só endpoints JSON crus (`/api/admin/compras/pendentes` + `/confirmar`), sem UI nem expiração automática de 48h
- [ ] ⬜ 6.4 — Métricas do negócio

## Fase 4 — Produção

### Épico 7 — Infraestrutura & Deploy
- [ ] ⬜ 7.1 — Provisionar VPS com hardening
- [ ] ⬜ 7.2 — Deploy da aplicação + upload do receita.db
- [ ] ⬜ 7.3 — Domínio + Caddy + HTTPS
- [ ] ⬜ 7.4 — CI/CD — deploy automático
- [ ] ⬜ 7.5 — Backups e limpeza de arquivos
- [ ] ⬜ 7.6 — Atualização mensal da base da Receita

### Épico 8 — Frontend do Produto
- [x] ✅ 8.1 — Fluxo autenticado na interface
- [x] ✅ 8.2 — Saldo no header + feedback de consumo
- [x] 🟡 8.3 — Telas de planos, conta e histórico — todas existem, navegação entre elas é básica (sem menu unificado)
- [x] 🟡 8.4 — Erros amigáveis e estados vazios — sugestões de nicho e CTA de saldo zero existem; não é sistemático em toda a interface

---

## Pendências transversais (não são história, mas bloqueiam produção)

- **Resend sem domínio verificado**: só entrega e-mail pro dono da própria conta (`kintekit@gmail.com`). Cadastro de qualquer outro usuário falha com 500 até resolver (verificar domínio, ou desativar SMTP customizado temporariamente, ou desligar "Confirm email" em dev). Achado em 2026-07-23.
- **Preços dos pacotes de crédito são placeholder** (`src/config/pacotes-creditos.js`) — decisão de negócio dos sócios, não validar como definitivo.
- **Migrations aplicadas manualmente**: não há credencial de banco direta neste ambiente de dev, só chaves de API — toda migration nova precisa ser colada no SQL Editor do dashboard Supabase por um humano. Ver `supabase/README.md` para a lista em ordem.

## Próximos passos sugeridos (na ordem que fazem mais sentido)

1. Resolver a pendência do Resend (bloqueia testar cadastro de usuários reais)
2. Configurar `PIX_CHAVE` real (fecha o Épico 2 de vez)
3. Épico 5 (observabilidade) — barato de fazer e melhora a visibilidade de tudo que vem depois
4. Épico 6 (painel admin) — hoje a confirmação de Pix e gestão de usuário são só endpoints crus
5. Épico 7 (deploy) — só depois de 5 e 6, senão vai pra produção sem conseguir operar nem monitorar
