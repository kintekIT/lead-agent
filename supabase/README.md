# Supabase — configuração do projeto KintekIT

Projeto: `bafsvszjpztbmbhmcwqk` · https://bafsvszjpztbmbhmcwqk.supabase.co

Este diretório versiona as migrations e os templates de email. O que roda em código já está no repositório — os passos abaixo são feitos **uma vez no dashboard** ([supabase.com/dashboard](https://supabase.com/dashboard/project/bafsvszjpztbmbhmcwqk)).

## 1. Chaves de API → `.env`

**Settings → API Keys**. Copie para o `.env` na raiz do repo (nunca commitar):

| Variável no `.env` | Chave no dashboard | Uso |
|---|---|---|
| `SUPABASE_URL` | Project URL | frontend + backend |
| `SUPABASE_ANON_KEY` | `anon` `public` (ou "Publishable key" no dashboard novo) | frontend (segura para expor) |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` `secret` (ou "Secret key") | **só backend** — ignora RLS, nunca vai para o navegador |

## 2. Aplicar as migrations

Opção A — **SQL Editor** (mais simples): abra *SQL Editor → New query*, cole o conteúdo de cada
arquivo abaixo **nesta ordem** (cada uma depende da anterior) e execute (Run):

1. `migrations/20260714120000_fundacao_contas_creditos.sql` — contas, créditos, buscas (Épico 0/1)
2. `migrations/20260722130000_debito_atomico_dedup.sql` — débito atômico + dedup 6 meses (histórias 2.3/3.1)
3. `migrations/20260722140000_previa_contagem.sql` — prévia pré-consumo (história 2.4)
4. `migrations/20260722150000_confirmar_compra_pix.sql` — confirmação de compra Pix (história 2.5)
5. `migrations/20260723160000_auditoria_eventos.sql` — tabela `events`, auditoria de ações admin (história 5.4)
6. `migrations/20260723170000_metricas_negocio.sql` — `metricas_negocio()`, agregados pro painel admin (história 6.4)

Opção B — **CLI** (mantém o histórico de migrations no Supabase):
```bash
npx supabase login
npx supabase link --project-ref bafsvszjpztbmbhmcwqk
npx supabase db push
```

A migration da fundação cria: `profiles`, `credit_ledger`, `purchases`, `searches`, `delivered_leads`,
índices do dedup, RLS (usuário só lê os próprios dados), a função `saldo_creditos()` e dois triggers:
criação automática do profile no cadastro e **+20 créditos de trial na confirmação do email**.

As 3 migrations seguintes (Épico 2) adicionam: `entregar_leads()` (débito atômico + dedup de 6
meses, com trava de concorrência e trigger que impede saldo negativo), `contar_novos()` (prévia,
só leitura) e `confirmar_compra()` (credita um pacote Pix e marca a compra como paga).

## 3. Autenticação (Authentication → Sign In / Providers → Email)

- **Confirm email**: ativado (já é o padrão) — sem confirmar, não loga.
- **Minimum password length**: `8`.

**Authentication → URL Configuration:**
- **Site URL**: `http://localhost:3000` (trocar pelo domínio quando for para o VPS)
- **Redirect URLs**: adicionar
  - `http://localhost:3000/login.html`
  - `http://localhost:3000/redefinir-senha.html`
  - (depois, as mesmas rotas no domínio de produção)

## 4. SMTP customizado — Resend

O SMTP nativo do Supabase tem limite baixíssimo (~2 emails/hora) — não serve para produção.

1. Crie conta em [resend.com](https://resend.com) e **verifique o domínio** de envio (ex.: `seudominio.com.br`) — sem domínio verificado só dá para mandar para o próprio email.
2. Crie uma **API Key** no Resend.
3. No Supabase: **Project Settings → Authentication → SMTP Settings** → Enable custom SMTP:
   - Host: `smtp.resend.com` · Port: `465`
   - Username: `resend`
   - Password: a API key do Resend
   - Sender email: `nao-responda@seudominio.com.br` · Sender name: `Lead Agent`

> Enquanto o domínio não estiver verificado, dá para desenvolver com o SMTP nativo do Supabase (os emails chegam, só que com limite baixo).

## 5. Templates de email em PT-BR

**Authentication → Emails → Templates**, cole o HTML de `templates/`:

| Template no dashboard | Arquivo | Assunto sugerido |
|---|---|---|
| Confirm signup | `templates/confirmacao-cadastro.html` | `Confirme seu email — Lead Agent` |
| Reset password | `templates/recuperacao-senha.html` | `Redefinição de senha — Lead Agent` |

## 6. Promover um admin (manual, por decisão de negócio)

```sql
update public.profiles set role = 'admin' where email = 'email@do.socio';
```

## Modelo de acesso (resumo)

- **RLS**: usuário autenticado só faz `SELECT` das próprias linhas; toda escrita passa pelo backend com `service_role`.
- **free** = saldo 0 (loga, vê histórico, não gera leads) · **premium** = saldo > 0 · **admin** = `profiles.role = 'admin'`.
- Saldo = `sum(delta)` em `credit_ledger` (função `saldo_creditos()`).
