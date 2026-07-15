# Lead Agent AI

Gerador de leads B2B no Brasil. Busca empresas por **nicho** e **região** e exporta uma **planilha Excel** com email, telefone e CNPJ de cada lead.

Desde a Fase 1 (Épicos 0 e 1), o sistema tem **contas de usuário com Supabase**: cadastro com confirmação de email, login obrigatório, créditos (1 crédito = 1 lead) e papéis free/premium/admin.

O projeto tem três motores de busca:

| Motor | Status | Como funciona |
|---|---|---|
| ⭐ **Receita Federal** | **Padrão (use este)** | Base local com dados abertos de CNPJ da RFB — instantâneo, sem chave de IA, até 1000 leads por busca |
| Agente IA (Claude/Gemini) | Legado, oculto na interface | LLM orquestra Maps + WHOIS + CNPJ — precisa de chave de API |
| RPA | Legado, oculto na interface | Scraping do Google Maps + WHOIS — lento, sem chave |

---

## ⭐ INÍCIO RÁPIDO (guia do novo dev — comece por aqui)

> Ao final destes passos você terá o sistema completo rodando localmente: interface web com login, créditos e o motor Receita Federal.

### Passo 1 — Instalar o Node.js
Baixe a versão **LTS** em https://nodejs.org e instale normalmente.

### Passo 2 — Clonar o projeto e instalar dependências
```bash
git clone https://github.com/kintekIT/lead-agent.git
cd lead-agent
npm install
```

### Passo 3 — Criar o `.env` com as chaves do Supabase
O modo web **exige** as chaves do projeto Supabase (é ele que guarda usuários e créditos). Copie o modelo e preencha:

```bash
# na raiz do projeto
copy .env.example .env      # Windows
# cp .env.example .env      # Linux/Mac
```

Abra o `.env` e preencha estas duas linhas (⚠️ **peça os valores ao Otávio por canal seguro** — WhatsApp/Signal, nunca pelo git):

```env
SUPABASE_ANON_KEY=cole_aqui
SUPABASE_SERVICE_ROLE_KEY=cole_aqui
```

A `SUPABASE_URL` já vem preenchida no `.env.example`. As chaves de IA (`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`) **não são necessárias** para o motor Receita Federal — só para os modos legados.

> O projeto Supabase (banco, migrations, SMTP, templates) **já está criado e configurado** — você não precisa criar nada lá. A infra está documentada em [`supabase/README.md`](supabase/README.md).

### Passo 4 — Baixar o banco de dados `receita.db`
O banco (**≈10,7 GB** descompactado) **não vem no clone** do git. Baixe pelo Google Drive:

> 📥 **Link do banco no Drive:** https://drive.google.com/file/d/1IBK0l-ffJ58Cko2l5tWc_JjDdfGsYNhn/view?usp=drive_link

Depois de baixar (e **extrair, se vier compactado**), coloque o arquivo em:
```
lead-agent/data/receita.db
```
(crie a pasta `data` na raiz do projeto se ela não existir)

### Passo 5 — Rodar
```bash
npm run web
```
Abra o navegador em **http://localhost:3000** — você será redirecionado para a **tela de login**.

### Passo 6 — Criar sua conta (leia o aviso do email!)
1. Na tela de login, aba **Criar conta**: email + senha (mínimo 8 caracteres) + aceite dos Termos
2. O sistema envia um link de confirmação por email — **conta não confirmada não loga**

⚠️ **Aviso para devs:** enquanto o domínio próprio não estiver verificado no Resend, o email de confirmação **só chega para `kintekit@gmail.com`** (e pode cair no spam). Para confirmar **qualquer outra conta** (a sua, por exemplo), rode no [SQL Editor do Supabase](https://supabase.com/dashboard/project/bafsvszjpztbmbhmcwqk/sql/new):

```sql
update auth.users set email_confirmed_at = now() where email = 'seu@email.com';
```

Isso confirma a conta **e** dispara automaticamente os **20 créditos de trial** (trigger no banco). Para virar admin:

```sql
update public.profiles set role = 'admin' where email = 'seu@email.com';
```

### Passo 7 — Buscar leads
1. Preencha **Nicho** (ex: `dentista`, `academia`, `advogado`), **Região** (ex: `São Paulo SP`) e **Quantidade** (1 a 1000)
2. Clique em **Iniciar Busca** — o resultado é praticamente instantâneo
3. Clique em **Baixar Planilha Excel** ao final

Cada lead consome 1 crédito do saldo (o débito efetivo entra no Épico 2). Saldo, extrato e histórico de buscas ficam na página **Minha Conta** (clique no seu email no header). As planilhas também ficam salvas na pasta `leads/` do projeto.

**Alternativa sem o Drive:** é possível gerar o banco localmente baixando os ZIPs dos [dados abertos de CNPJ da RFB](https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/) e rodando `npm run importar-receita "C:\pasta\dos\zips"` — mas demora bastante; o Drive é o caminho recomendado.

---

## Contas, créditos e Supabase (Fase 1)

Resumo do que os Épicos 0 e 1 implementaram — detalhes em [`supabase/README.md`](supabase/README.md):

- **Toda rota `/api/*` exige login** (JWT do Supabase; sem token → 401). Middleware em `src/auth/middleware.js`.
- **Papéis:** free (saldo 0 — loga, vê histórico, não gera leads), premium (saldo > 0 — gera até o limite do saldo), admin (painel; papel atribuído manualmente no banco). Regras aplicadas **no backend**.
- **Créditos:** 1 crédito = 1 lead. Trial de **20 créditos** ao confirmar o email. Saldo = soma do extrato (`credit_ledger`).
- **Banco (Postgres/Supabase):** `profiles`, `credit_ledger`, `purchases`, `searches`, `delivered_leads` (base do dedup de 6 meses). RLS ativa: usuário só lê os próprios dados; só o backend (service_role) escreve.
- **Migrations versionadas** em `supabase/migrations/` — se criar uma nova, versione lá e aplique via SQL Editor ou `npx supabase db push`.
- **Emails:** confirmação e recuperação de senha em PT-BR (templates em `supabase/templates/`), enviados via SMTP do Resend.

---

## Fluxo de trabalho git (para desenvolver os épicos)

O repositório oficial é **https://github.com/kintekIT/lead-agent** (branch principal: `main`).

```bash
# 1. Sempre parta do main atualizado
git checkout main
git pull

# 2. Crie um branch para o épico/história
git checkout -b epico-2-debito-creditos

# 3. Trabalhe e commite normalmente
git add -A
git commit -m "feat: débito de créditos ao entregar leads (Épico 2.1)"

# 4. Suba o branch e abra um Pull Request para main
git push -u origin epico-2-debito-creditos
```

Abra o Pull Request no GitHub, o outro sócio revisa e faz o merge. Evite commitar direto no `main` — assim um não atropela o trabalho do outro.

**Nunca commitar:** `.env` (chaves), `data/` (banco de 10,7 GB) e `leads/` (planilhas geradas) — os três já estão no `.gitignore`.

---

## Modos legados (Agente IA e RPA)

Tudo abaixo desta linha se refere aos motores antigos, que continuam funcionando mas estão **ocultos na interface**. Só siga adiante se for usá-los — eles exigem chaves de API de IA no `.env`:

```env
# Para usar o Claude (pago) — https://console.anthropic.com
ANTHROPIC_API_KEY=sua_chave_aqui

# Para usar o Gemini (gratuito) — https://aistudio.google.com/apikey
GEMINI_API_KEY=sua_chave_aqui
```

### Modos de execução

| Comando | O que faz |
|---|---|
| `npm run web` | ⭐ Interface web (porta 3000) — 3 motores, com login |
| `npm start` | Claude via terminal (sem login — uso local/debug) |
| `npm run gemini` | Gemini via terminal |
| `npm run web:gemini` | Interface web do Gemini (porta 3001, legado sem login) |
| `npm run importar-receita` | Importa os ZIPs da RFB → `data/receita.db` |

---

## Estrutura do projeto

```
lead-agent/
├── src/
│   ├── server.js              # Servidor web (porta 3000) — auth + roteia os 3 motores
│   ├── auth/
│   │   ├── supabase.js        # 🔐 Clientes Supabase do backend (anon p/ validar JWT, service_role p/ escrever)
│   │   └── middleware.js      # 🔐 autenticar (JWT em /api/*), exigirAdmin, saldoCreditos
│   ├── executor-receita.js    # ⭐ Motor Receita Federal (orquestração)
│   ├── rpa.js                 # Motor RPA
│   ├── agent.js               # Motor Agente IA — Claude
│   ├── agent-gemini.js        # Motor Agente IA — Gemini
│   ├── index.js               # Entrada — Claude via terminal
│   ├── index-gemini.js        # Entrada — Gemini via terminal
│   ├── server-gemini.js       # Servidor web — Gemini (porta 3001)
│   ├── scripts/
│   │   └── importar-receita.js  # ⭐ Importa os ZIPs da RFB → data/receita.db
│   ├── tools/
│   │   ├── receita.js         # ⭐ Consulta ao banco da Receita (CNAE + município)
│   │   ├── maps.js            # Scraping Google Maps (Playwright)
│   │   ├── cnpj.js            # Consulta CNPJ via API pública
│   │   ├── leads.js           # Gerenciamento e exportação dos leads
│   │   └── whois.js           # Consulta WHOIS no registro.br
│   └── utils/
│       ├── excel.js           # Geração da planilha Excel
│       └── historico.js       # Dedup de domínios entre execuções (RPA)
├── public/
│   ├── index.html             # Interface principal (exige login)
│   ├── login.html             # 🔐 Login, cadastro e "esqueci minha senha"
│   ├── redefinir-senha.html   # 🔐 Tela do link de redefinição
│   ├── conta.html             # 🔐 Minha Conta — plano, saldo, extrato, histórico
│   ├── termos.html            # Termos de Uso (rascunho)
│   └── js/auth.js             # 🔐 Sessão compartilhada no frontend
├── supabase/
│   ├── README.md              # 🔐 Setup do projeto Supabase (dashboard) passo a passo
│   ├── migrations/            # 🔐 Migrations versionadas do Postgres
│   └── templates/             # 🔐 Templates de email PT-BR (confirmação, recuperação)
├── data/
│   └── receita.db             # ⭐ Banco da Receita (≈10,7 GB — baixar do Drive, NÃO versionado)
├── leads/                     # Planilhas geradas (NÃO versionado)
├── .env                       # Chaves Supabase (+ IA p/ modos legados) — NÃO versionar
├── .env.example               # Modelo do .env
└── package.json
```

---

## Solução de problemas comuns

**API responde 503 / "Supabase não configurado no servidor"**  
Faltam as chaves `SUPABASE_*` no `.env` (Passo 3 do Início Rápido). Preencha e reinicie o servidor.

**O email de confirmação não chegou**  
1. Olhe a pasta de **spam** (sem domínio verificado no Resend isso é comum).  
2. Sem domínio verificado, o Resend **só entrega para `kintekit@gmail.com`** — para qualquer outra conta, confirme manualmente pelo SQL do Passo 6.

**"Você está sem créditos" ao gerar leads**  
Sua conta está no plano free (saldo 0). Confirme o email para ganhar os 20 créditos de trial — ou peça um ajuste de saldo a um admin.

**Fui deslogado / a API respondeu 401**  
A sessão expirou. Faça login de novo — o token renova sozinho enquanto a aba estiver aberta.

**Erro ao buscar no modo Receita Federal / `unable to open database file`**  
O arquivo `data/receita.db` não está no lugar. Confira se ele existe exatamente em `lead-agent/data/receita.db` (Passo 4). Se baixou compactado do Drive, extraia antes.

**Erro: `ANTHROPIC_API_KEY não configurada`**  
Só afeta os modos legados de IA. Crie a chave e cole no `.env`, ou use o modo Receita Federal.

**Erro: `Cannot find module`**  
Execute `npm install` para instalar as dependências.

**Porta já em uso (EADDRINUSE)**  
Outra instância do servidor já está rodando. Feche o terminal anterior ou troque a porta no `.env`:
```env
PORT=3002
```

**`node` não é reconhecido como comando**  
Node.js não está instalado ou não foi adicionado ao PATH. Reinstale pelo site oficial: https://nodejs.org
