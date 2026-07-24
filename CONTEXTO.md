# CONTEXTO.md — Documento de contexto do projeto lead-agent

> **Para quem é este documento:** este arquivo dá visão global do projeto para qualquer pessoa (ou Claude Code) que entre agora. Ele descreve o que o produto faz, a arquitetura, o rumo estratégico e todas as atualizações até 2026-07-14.
>
> **Dica:** para o Claude Code carregar este contexto automaticamente, crie um `CLAUDE.md` na raiz com a linha `Leia o arquivo CONTEXTO.md antes de qualquer tarefa.` — ou renomeie este arquivo para `CLAUDE.md`.

---

## 1. O que é o projeto

**lead-agent** é um gerador de leads B2B para o Brasil. O usuário informa **nicho** (ex: "dentista"), **região** (ex: "São Paulo SP") e **quantidade**, e o sistema entrega uma **planilha Excel** com empresas contendo **email + telefone + CNPJ** (qualificação mínima: lead só é salvo se tiver email E telefone).

O produto será **vendido como SaaS** (ver seção 8 — decisões de negócio). Somos dois sócios trabalhando nele.

---

## 2. Rumo estratégico — MOTOR RECEITA FEDERAL É O CAMINHO

Este é o ponto mais importante do documento:

**O futuro do produto é o motor Receita Federal.** Ele consulta uma base local SQLite construída a partir dos dados abertos de CNPJ da Receita Federal, e resolve os problemas dos motores antigos:

| | Motores antigos (Agente IA / RPA) | Motor Receita Federal |
|---|---|---|
| Velocidade | 15 leads em ~6 min | 500+ leads em **< 20 ms** de query |
| Escala | Inviável para 500–1000 leads | 1000 leads sem esforço |
| Risco | Bloqueio do Google Maps / registro.br | Zero — banco local, sem scraping |
| Custo | Tokens de API (modo Agente) | Zero |
| Fonte | Maps + WHOIS + cnpj.ws | Base oficial da RFB (23,9M estabelecimentos) |

**Estado atual da UI:** os botões "Agente IA" e "RPA" estão **ocultos** (`display:none` no [public/index.html](public/index.html)) e o modo padrão é `receita`. O backend continua suportando os 3 modos — os motores antigos ficam como fallback/legado, não foram removidos.

O motor Receita Federal foi **validado na prática**: busca de 500 leads de academia em São Paulo SP feita com sucesso pelo usuário.

---

## 3. Os três motores

### Motor 1 — Agente IA (legado, oculto na UI)
- [src/agent.js](src/agent.js) (Claude) e [src/agent-gemini.js](src/agent-gemini.js) (Gemini)
- LLM orquestra as ferramentas (Maps, WHOIS, CNPJ) via tool-use
- Requer `ANTHROPIC_API_KEY` ou `GEMINI_API_KEY` no `.env`
- Custo por token; lento

### Motor 2 — RPA (legado, oculto na UI, mas recém-otimizado)
- [src/rpa.js](src/rpa.js) + [src/tools/maps.js](src/tools/maps.js)
- Fluxo: Google Maps (Playwright) → WHOIS registro.br → API cnpj.ws → fallback: raspar CNPJ do site da empresa
- Sem custo de tokens, mas depende de scraping (risco de bloqueio)
- Recebeu grandes melhorias de paralelismo e stealth neste commit (ver seção 6)

### Motor 3 — Receita Federal (ATUAL, padrão) ⭐
- [src/tools/receita.js](src/tools/receita.js) — consulta ao SQLite
- [src/executor-receita.js](src/executor-receita.js) — orquestração: busca → salva leads → gera Excel → emite eventos SSE
- [src/scripts/importar-receita.js](src/scripts/importar-receita.js) — importador da base (roda uma vez; `npm run importar-receita`)
- Busca por **CNAE + município** com índice; sem rede, sem risco, instantâneo

---

## 4. Arquitetura e mapa de arquivos

```
lead-agent/
├── src/
│   ├── server.js              # Servidor Express (porta 3000) — roteia os 3 modos
│   ├── executor-receita.js    # ⭐ Motor Receita Federal
│   ├── rpa.js                 # Motor RPA (paralelo, 5 workers)
│   ├── agent.js               # Motor Agente IA (Claude)
│   ├── agent-gemini.js        # Motor Agente IA (Gemini)
│   ├── index*.js              # Entradas via terminal (start / gemini / rpa)
│   ├── server-gemini.js       # Servidor web Gemini (porta 3001)
│   ├── scripts/
│   │   ├── importar-receita.js          # ⭐ Importa ZIPs da RFB → data/receita.db
│   │   ├── validar-sinonimos.js         # Confere dicionário de nichos contra o banco real
│   │   └── detectar-emails-genericos.js # Gera tabela emails_genericos (filtro de qualidade)
│   ├── config/
│   │   └── sinonimos-cnae.js  # Dicionário nicho → raiz de CNAE (18 validados + 34 pendentes)
│   ├── middleware/
│   │   ├── seguranca.js       # Helmet, CORS restrito, rate limit (história 4.1)
│   │   └── validar.js         # Middleware genérico de validação zod (história 4.2)
│   ├── validation/
│   │   └── schemas.js         # Schemas zod das rotas (história 4.2)
│   ├── tools/
│   │   ├── receita.js         # ⭐ Query SQLite: sinônimos + CNAE + município + filtros de qualidade
│   │   ├── maps.js            # Scraping Google Maps (Playwright + stealth)
│   │   ├── whois.js           # WHOIS registro.br
│   │   ├── cnpj.js            # API pública cnpj.ws
│   │   └── leads.js           # Gerenciador de leads + exportação
│   └── utils/
│       ├── excel.js           # Geração da planilha (exceljs)
│       └── historico.js       # Dedup de domínios entre execuções (RPA)
├── public/index.html          # Interface web (SPA única, SSE para tempo real)
├── data/receita.db            # ⚠️ Base RFB 5,2 GB — NÃO versionada (.gitignore)
├── leads/                     # Planilhas geradas
└── .env                       # Chaves de API (só p/ modo Agente) — NÃO versionado
```

**Fluxo web:** `POST /api/iniciar` (nicho, região, quantidade, modo) → servidor escolhe o executor → eventos em tempo real via **SSE** (`inicio`, `log`, `ferramenta`, `lead_salvo`, `gerando_excel`, `fim`) → botão de download da planilha ao final. Sessões ficam **em memória** no server (relevante para o plano de deploy).

---

## 5. Motor Receita Federal em detalhe

### O banco `data/receita.db` (SQLite, 5,2 GB)

```sql
cnaes(codigo PK, descricao)                 -- 1.359 linhas
municipios(codigo PK, nome)                 -- 5.572 linhas (nome COM aspas: '"SAO PAULO"')
empresas(cnpj_basico PK, razao_social)      -- 68.629.147 linhas (cnpj_basico COM aspas)
estabelecimentos(cnpj PK, cnpj_basico, nome, email, telefone, cnae, uf,
                 municipio, logradouro, numero, bairro, cep, matriz)
                                            -- 23.931.353 linhas (valores LIMPOS)
importados(arquivo PK, importado_em)        -- checkpoint por ZIP (todos os 10 marcados)

INDEX idx_cnae_uf_mun ON estabelecimentos(cnae, uf, municipio)
INDEX idx_uf_mun      ON estabelecimentos(uf, municipio)
```

Só entram no banco estabelecimentos **ativos** (situação 02) **com email válido e telefone** — por isso 23,9M de um universo maior.

### ⚠️ Quirks do banco — LEIA ANTES DE MEXER EM receita.js

- `empresas.cnpj_basico` está armazenado **COM aspas** (ex: `"41273589"`) — legado do primeiro import.
- `estabelecimentos.cnpj_basico` está **LIMPO** (ex: `41273589`) — corrigido no reimport.
- O JOIN em [src/tools/receita.js](src/tools/receita.js) compensa: `ON em.cnpj_basico = '"' || e.cnpj_basico || '"'`.
- `municipios.nome` também tem aspas; o SELECT usa `REPLACE()` para limpar.
- `estabelecimentos.municipio` guarda o **nome** da cidade (não o código), limpo, MAIÚSCULO e sem acentos.
- `cnaes.descricao` **pode vir com aspas** (o importador só faz `.trim()`, não remove aspas como faz para os outros campos) — por isso o SELECT de atividade também usa `REPLACE()`.
- `estabelecimentos.matriz` é `INTEGER`: `1` = matriz, `2` = filial (confirmado em `importar-receita.js`, linha ~329).

### Qualidade dos resultados (história 3.4, 2026-07-15)

`buscarLeadsReceita` agora aplica três filtros de qualidade na query principal:
- **Somente matriz**: `AND e.matriz = 1` — evita filiais duplicando a mesma empresa na planilha.
- **Telefone-lixo**: função pura `ehTelefoneValido()` registrada como UDF do SQLite (`db.function('telefone_valido', ...)`) — descarta números onde o assinante (dígitos após o DDD) é o mesmo dígito repetido (`9999-9999`, `0000-0000` etc).
- **Email genérico** (ex.: email de escritório de contabilidade repetido em centenas de CNPJs de clientes): filtrado via `NOT IN (SELECT email FROM emails_genericos)`, mas **só se essa tabela já existir** — ela é gerada por [src/scripts/detectar-emails-genericos.js](src/scripts/detectar-emails-genericos.js) (`npm run detectar-emails-genericos`), que precisa ser rodado contra o banco real (varre as 23,9M linhas de `estabelecimentos`). Se a tabela não existir, a busca segue normalmente e retorna um aviso em `resultado.avisos` (propagado pro SSE como `log`).

Planilha ganhou 3 colunas novas (sempre no fim, pra não deslocar índices de formatação existentes): **CNAE/Atividade**, **Cidade**, **Endereço** (este último montado por `formatarEndereco()` a partir de logradouro/número/bairro/CEP).

Tudo isso foi testado de ponta a ponta com um banco SQLite fake (schema idêntico, sem dados reais) antes do commit — ver `test/qualidade-resultados.test.js` para os testes permanentes das funções puras.

### Sinônimos de nicho

Dicionário extraído para [src/config/sinonimos-cnae.js](src/config/sinonimos-cnae.js) (história 3.3, 2026-07-15) — antes vivia inline em `receita.js`. Traduz termo coloquial → raiz que aparece na descrição do CNAE: `dentista→ODONTOL`, `médico→MEDIC`, `advogado→ADVOCA`, `contador→CONTAB`, `academia→CONDICIONAMENTO FISICO`, `farmácia→FARMAC`, etc. Além disso há um stemming simples (corta 2 chars finais de palavras > 6 letras) e sugestão de termos parecidos via distância de Levenshtein quando nenhum CNAE bate.

---

## 5.1 Segurança — Hardening HTTP e validação de entrada (histórias 4.1/4.2, 2026-07-15)

### Hardening HTTP básico ([src/middleware/seguranca.js](src/middleware/seguranca.js))
- **Helmet**: headers de segurança padrão (CSP, HSTS, X-Frame-Options, X-Content-Type-Options etc.) em toda resposta.
- **CORS restrito**: só aceita `origin` igual à variável de ambiente `APP_ORIGIN` (default `http://localhost:3000` em dev). **Definir `APP_ORIGIN` no `.env` de produção** quando o domínio final existir (ver Épico 7.3).
- **Limite de payload**: `express.json({ limit: '10kb' })` — corpo maior que isso recebe `413` antes mesmo de chegar na lógica de negócio.
- **Rate limit**: 100 requisições/minuto por IP, aplicado só em `/api/*` (não trava o carregamento de assets estáticos da SPA). Primeira barreira, grossa — limite por usuário autenticado é a história 4.3, que depende do Épico 0/1.

### Validação de entrada ([src/validation/schemas.js](src/validation/schemas.js) + [src/middleware/validar.js](src/middleware/validar.js))
- Schemas **zod** para `POST /api/iniciar` (nicho, região, quantidade, modo) e para o parâmetro `:id` de `/api/eventos/:id` e `/api/download/:id`.
- Erro de validação → `400` com `{ erro, detalhes: [{ campo, mensagem }] }`, um item por campo inválido.
- `quantidade` é coagida de string pra number automaticamente (`z.coerce.number()`); `modo` tem allowlist estrita (`agente`/`rpa`/`receita`) — um valor fora disso já não passa da validação, então o roteamento de executor em `server.js` nunca recebe modo inesperado.
- **Confirmado**: todas as queries SQL do projeto (em `receita.js`, `importar-receita.js`, `detectar-emails-genericos.js`, `validar-sinonimos.js`) já usavam `?` parametrizado antes desta história — nenhuma interpolação direta de input do usuário em SQL foi encontrada na varredura feita para fechar esta história.

Testado manualmente de ponta a ponta (headers presentes, erros 400 com mensagem por campo, payload grande rejeitado com 413, rate limit ativando em ~100 req/min) além de 10 testes automatizados em `test/validacao.test.js`.

**Nota de dependências**: `npm audit fix` (sem `--force`) resolveu 3 das 5 vulnerabilidades pré-existentes nas dependências transitivas antigas (form-data, qs, tmp). Resta uma (`uuid`, via `exceljs`) que só se resolve com downgrade do `exceljs` — deixada de lado por ora por ser breaking change, não introduzida por esta história.

O arquivo é dividido em dois grupos:
- `SINONIMOS_VALIDADOS` — os 18 originais, **validados contra o banco** em 2026-07-13.
- `SINONIMOS_NOVOS_PENDENTE_VALIDACAO` — mais 34 nichos (petshop, salão de beleza, imobiliária, restaurante, oficina, escola, transportadora, hotel, construtora, seguros, ótica, joalheria, gráfica, etc.), mapeados a partir da nomenclatura oficial do CNAE 2.3, mas **ainda não conferidos linha a linha contra `receita.db`** (banco indisponível no momento da expansão). Rodar `npm run validar-sinonimos` numa máquina com o banco antes de considerar a história 3.3 encerrada — o script reporta qualquer raiz sem correspondência.

Testes automatizados em `test/sinonimos-cnae.test.js` e `test/receita-matching.test.js` (`npm test`, Node test runner nativo, sem dependência nova) cobrem a integridade do dicionário e a lógica pura de matching/sugestão.

### Importação (já feita — não precisa rodar de novo)

`npm run importar-receita "C:\pasta\com\zips"` — espera `Cnaes.zip`, `Municipios.zip`, `Empresas0-9.zip`, `Estabelecimentos0-9.zip` dos [dados abertos de CNPJ da RFB](https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj/). Streaming ZIP→CSV (ISO-8859-1), lotes de 10k em transação, checkpoint por arquivo (retomável). A RFB atualiza a base **mensalmente** — reimportação periódica está no backlog de produção.

**Bug histórico importante:** o CSV da RFB envolve valores em aspas (`"63621960"`). A primeira versão do importador não removia as aspas, o CNPJ concatenado ficava com 20 chars e **todos** os registros eram descartados. Corrigido com `strip()` por campo; reimportação feita com sucesso.

---

## 5.2 Painel Admin — Gestão de usuários (história 6.1, 2026-07-22)

Primeira tela do Épico 6 (Painel Admin). Todas as rotas ficam atrás de `exigirAdmin` (história 0.3) — o frontend só reflete, quem barra é o backend (história 1.4).

- **Backend** ([src/server.js](src/server.js)): `GET /api/admin/usuarios` (lista paginada de 20, busca por email via `ilike` em `profiles`), `GET /api/admin/usuarios/:id` (detalhe: perfil + saldo + últimos 20 do `credit_ledger` + últimas 20 `searches` + status de bloqueio), `POST /api/admin/usuarios/:id/bloquear|desbloquear` (usa `supabaseAdmin.auth.admin.updateUserById` com `ban_duration` — não existe "banimento permanente" nativo no GoTrue, a convenção é `'876000h'` ≈ 100 anos), `PATCH /api/admin/usuarios/:id/papel` (promove/rebaixa `user`↔`admin` em `profiles.role`). As três rotas de escrita recusam a própria conta do admin logado (evita autobloqueio/autorebaixamento).
- **Frontend**: [public/admin.html](public/admin.html) — lista com busca (debounce 300ms) e paginação, clique na linha abre o detalhe (saldo, extrato, buscas, ações). Guard de admin no frontend também (`/api/me` → `role !== 'admin'` → redireciona), mas é só UX; a garantia real é o backend.
- Link "🛠️ Admin" aparece no header de `index.html` e `conta.html` só quando `me.role === 'admin'`.
- **Bug do Express 5 encontrado e corrigido**: `req.query` no Express 5 é um getter sem setter (`Object.defineProperty` no prototype) — o middleware `validar()` (história 4.2) fazia `req[fonte] = resultado.data`, o que quebra para `fonte='query'` (primeira vez que o projeto valida query string). Corrigido em [src/middleware/validar.js](src/middleware/validar.js) redefinindo a propriedade na instância da requisição quando `fonte === 'query'`. Coberto por teste em `test/validacao.test.js`.

---

## 6. Atualizações deste commit (changes de 2026-07-14)

Tudo abaixo está no working tree e será commitado em sequência:

### Novos arquivos (motor Receita Federal completo)
- [src/tools/receita.js](src/tools/receita.js) — consulta SQLite (sinônimos, município, query indexada)
- [src/executor-receita.js](src/executor-receita.js) — executor do modo `receita`
- [src/scripts/importar-receita.js](src/scripts/importar-receita.js) — importador da base RFB

### [src/server.js](src/server.js)
- Aceita `modo='receita'` e roteia para `executarReceita`
- Limite de quantidade subiu de **50 → 1000**

### [public/index.html](public/index.html)
- Terceiro botão de modo **"Receita Federal"** — agora o padrão (`modoAtual = 'receita'`)
- Botões "Agente IA" e "RPA" ocultos com `display:none` (backend mantém os 3)
- Campo quantidade: máx 1000, valor inicial 20

### [src/rpa.js](src/rpa.js) — paralelização do enriquecimento
- Enriquecimento agora roda em **pool de 5 workers paralelos** (antes: for sequencial com pausa de 1,2s entre empresas)
- **Semáforo WHOIS**: máx. 3 consultas simultâneas ao registro.br
- Raspagem de CNPJ do site: as 5 URLs candidatas são buscadas **em paralelo** (`Promise.allSettled`; antes sequencial, até 40s)
- Histórico de domínios salvo **uma única vez** ao final (antes: a cada lead)

### [src/tools/maps.js](src/tools/maps.js) — escala + anti-detecção
- **Múltiplas variações de query** (até 12: "X em Y", "X zona norte Y", "X Y LTDA"...) para superar o limite de ~200 resultados por busca do Maps; meta de pool = 8× a quantidade pedida
- **Novo contexto de browser por busca** = nova sessão/fingerprint; user-agent sorteado de uma lista de 5
- **Script de furtividade** (`aplicarFurtividade`): `navigator.webdriver = undefined`, `window.chrome` fake, plugins fake, languages/platform/hardwareConcurrency/deviceMemory patcheados, permissions API corrigida
- Flags de launch: `--disable-blink-features=AutomationControlled` etc.
- Intervalo aleatório de 4–9s entre buscas; scroll com offset e incrementos variáveis

### Configuração
- [package.json](package.json): novas deps `better-sqlite3`, `iconv-lite`, `node-stream-zip`; novo script `importar-receita`. (A chave `scripts` duplicada que existia antes **já foi corrigida**.)
- [.gitignore](.gitignore): adicionado `data/` — **o banco de 5,2 GB não vai para o git** (ver seção 9)
- [README.md](README.md): nota rápida do `npm run web`

### Correções anteriores relevantes (já no working tree)
- Sinônimo `ACADEMIA` apontava para `'GINAST'`, que não existe em nenhum CNAE → corrigido para `CONDICIONAMENTO FISICO` (CNAE 9313-1/00)

---

## 7. Como rodar

```bash
npm install
npm run web        # http://localhost:3000
```

- Modo **Receita Federal** (padrão): não precisa de nenhuma chave de API — só do `data/receita.db`.
- Modos Agente IA: precisam de `.env` com `ANTHROPIC_API_KEY` e/ou `GEMINI_API_KEY`.
- Planilhas saem em `leads/`.

---

## 8. Decisões de negócio e plano de produção (definidas em 2026-07-13)

O produto será vendido. Modelo definido (proposta a validar entre os sócios):

- **1 crédito = 1 lead entregue**; pacotes via **Pix** (200/500/1000...)
- **Trial**: 20 créditos após confirmar email
- **Free** = saldo 0 (loga, vê histórico e prévia de contagem, mas não gera leads); **Premium** = saldo > 0; **Admin** = role à parte
- **Stack de produção**: **Supabase** (Auth + Postgres) para usuários/créditos/histórico; `receita.db` continua **SQLite local no VPS**
- **Dedup por usuário**: lead entregue não se repete por **6 meses** (tabela `delivered_leads` no Supabase)
- **Deploy**: **VPS + pm2 + Caddy** (HTTPS; basic auth na fase pré-login). **Vercel foi descartada** (banco de 5,2 GB no disco + SSE + sessões em memória não cabem em serverless)

### Backlog (9 épicos, 41 histórias) — artifacts publicados
- Backlog completo: https://claude.ai/code/artifact/73e7f80e-504d-459b-b720-00e1185a7fdb
  - Fase 1 — Fundação: Supabase, auth, confirmação de email
  - Fase 2 — Monetização: créditos, dedup, pacotes
  - Fase 3 — Operação: painel admin, logs, Pix
  - Fase 4 — Produção: VPS, CI/CD, atualização mensal da base RFB
- Diagrama do fluxo do motor: https://claude.ai/code/artifact/2848e2e7-f403-430d-a9df-061c27b38f3e

---

## 9. Setup para um novo dev (IMPORTANTE para o sócio)

1. `git clone https://github.com/Levartosky/lead-agent.git && cd lead-agent && npm install`
2. **O banco `data/receita.db` (5,2 GB) NÃO vem no clone** — `data/` está no `.gitignore`. Duas opções:
   - **Opção A (mais simples):** receber o arquivo `receita.db` pronto (pen drive / drive) e colocar em `data/receita.db`
   - **Opção B:** baixar os 22 ZIPs dos dados abertos de CNPJ da RFB e rodar `npm run importar-receita "C:\pasta\dos\zips"` (demora bastante; é retomável se interromper)
3. `npm run web` → http://localhost:3000 → modo Receita Federal já vem selecionado
4. `.env` só é necessário se for testar os modos Agente IA (ocultos na UI)

---

## 10. Quirks, armadilhas e próximos passos técnicos

**Armadilhas conhecidas:**
- As aspas no banco (seção 5) — qualquer query nova em `empresas`/`municipios` precisa lidar com elas
- Sessões SSE ficam em memória no server — reiniciar o server mata sessões em andamento
- O matching de CNAE é feito em JS (não em SQL) porque o `upper()` do SQLite não trata acentos

**Melhorias mapeadas (não feitas ainda):**
- Qualidade dos resultados: hoje a busca por "dentista" mistura clínicas com fornecedores de equipamentos odontológicos (o CNAE raiz `ODONTOL` pega ambos)
- Filtrar só estabelecimentos **matriz** (`matriz = 1`) para evitar filiais duplicadas
- Paginação/offset para buscar além de 1000 resultados
- Mais sinônimos no mapa de CNAE
- Todo o backlog de produção da seção 8

---

## 11. Épico 2 — Créditos & Monetização (implementado em 2026-07-22)

Todas as 6 histórias do Épico 2 (mais a 3.1, dedup, que é pré-requisito técnico da 2.3):

- **2.1 Trial 20 créditos** — já existia desde a Fase 1 (trigger `conceder_trial` na migration da fundação).
- **2.2 Saldo e extrato** — já existia desde a Fase 1; adicionado paginação ("Carregar mais") e coluna de busca associada em `conta.html`.
- **2.3 Débito atômico + 3.1 Dedup** — nova função `entregar_leads()` (migration `20260722130000`): recebe um pool de CNPJs candidatos, filtra os já entregues ao usuário nos últimos 6 meses, corta pelo saldo real e pela quantidade pedida, grava tudo atomicamente. Trava por `pg_advisory_xact_lock` + trigger que impede saldo negativo (concorrência). `server.js` agora busca 3x mais candidatos no `receita.db` do que o pedido (`src/config/pool-dedup.js`) para sobrar depois do dedup.
- **2.4 Prévia** — `contar_novos()` (migration `20260722140000`) + `POST /api/previa`: conta quantos leads são novos sem gravar nada. O botão "Iniciar Busca" agora mostra um `confirm()` com o resultado antes de disparar a busca de verdade.
- **2.5 Pix** — `src/utils/pix.js` gera o payload EMV/BR Code (copia-e-cola + QR via `qrcode`); `PACOTES` em `src/config/pacotes-creditos.js` (**preços placeholder — ajustar antes de produção**); `POST /api/compras` cria a cobrança, `GET /api/compras/:id` é usado pro polling em `planos.html`. Confirmação ainda é manual (etapa 1 do backlog) — sem painel admin (Épico 6) ainda, confirme assim:
  ```bash
  # pegue um token de admin (role=admin no profiles) e rode:
  curl http://localhost:3000/api/admin/compras/pendentes -H "Authorization: Bearer $TOKEN"
  curl -X POST http://localhost:3000/api/admin/compras/<id>/confirmar -H "Authorization: Bearer $TOKEN"
  ```
  Precisa configurar `PIX_CHAVE`/`PIX_NOME_RECEBEDOR`/`PIX_CIDADE` no `.env` — sem `PIX_CHAVE`, `/api/compras` responde 503.
- **2.6 Saldo zerado → free** — com saldo 0, o botão "Iniciar Busca" em `index.html` vira "Comprar créditos" (leva pra `/planos.html`); a prévia continua funcionando sem saldo.

**Migrations pendentes de aplicar no dashboard (SQL Editor, na ordem):**
`20260722130000_debito_atomico_dedup.sql` → `20260722140000_previa_contagem.sql` → `20260722150000_confirmar_compra_pix.sql`.

**O que ainda falta do backlog original (fora do escopo desta rodada):** 3.2 (histórico de re-download sem debitar — já existe listagem, falta só o re-download não cobrar de novo, mas como já não cobra na primeira tela isso é conferir), Épico 6 completo (painel admin de verdade — por ora só endpoints JSON), 4.3/4.4/4.5.

---

## 12. Agente e skills do Claude Code para este projeto (2026-07-23)

Criado `.claude/agents/lead-agent-dev.md` — um subagente do Claude Code com toda a arquitetura, convenções e regras de negócio deste projeto no system prompt (motores, schema Supabase, padrões de migration/SQL, fluxo de git por história, como testar de verdade). Junto, duas skills:

- `.claude/skills/nova-historia/SKILL.md` — proceduraliza o fluxo completo de implementar uma história do backlog (branch → migration → código → testes → merge → docs).
- `.claude/skills/validar-migration/SKILL.md` — proceduraliza como testar uma função Postgres nova contra o banco real (técnica do token via magic link, checklist de dedup/concorrência).

Também criado `BACKLOG.md` na raiz — checklist estruturado das 41 histórias dos 9 épicos com status real (✅/🟡/⬜), que é a fonte de verdade sobre progresso; este `CONTEXTO.md` continua sendo o changelog narrativo do *porquê*.

**Por que desse jeito:** tudo isso são arquivos versionados no git — `git push`/`git pull`/`git merge` já bastam pra compartilhar com o sócio e manter os dois em sincronia, sem precisar de nenhuma ferramenta nova. O agente e as skills são descobertos automaticamente pelo Claude Code assim que alguém abre este repo (não precisa registrar em lugar nenhum).

**Atualização do mesmo dia:** a skill `nova-historia` sempre criava a branch do zero, sem checar se já existia uma. Rodando `git fetch kintekit --prune` apareceram **22 branches pré-criadas** cobrindo quase todo o backlog restante (3.2, 4.3, 4.5, 5.1-5.4, 6.1-6.4, 7.1-7.6, 8.3-8.4) — 21 delas vazias (só reserva de nome), mas `feature/6.1-admin-gestao-usuarios` tem trabalho real (`admin.html` com ~300 linhas + mudanças em `server.js`), aparentemente o sócio trabalhando em paralelo, baseada num ponto antigo da main. Corrigido: a skill e o agente agora mandam checar branches existentes antes de criar uma nova, e param pra avisar o usuário se acharem trabalho real de outra pessoa em vez de mexer sozinhas. Detalhe registrado no `BACKLOG.md`.

---

## 13. Épico 5 — Observabilidade & Logs (em andamento, 2026-07-23)

Pedido pelo mecanismo do agente ("continua o épico 5") — histórias sendo feitas em sequência, uma branch por vez, sem parar entre elas.

**5.1 — Logger estruturado + log de toda requisição:** `src/utils/logger.js` (pino, `criarLogger(destino?)` — destino só é usado nos testes, pra capturar a saída em memória) + `src/middleware/log-requisicao.js` (pino-http, montado como o **primeiro** middleware do `server.js` — captura até requisição barrada por rate limit/CORS/auth). Cada linha de log tem request-id (também devolvido no header `X-Request-Id`), `userId` (lido de `req.usuario.id`, preenchido depois que a auth roda — funciona porque o log só é escrito quando a resposta termina, não quando o middleware é montado), rota e status/latência automáticos do pino-http. Nível vira `warn` em 4xx e `error` em 5xx (`customLogLevel`). Redação: `authorization`, `cookie`, `password`/`senha`/`token` em qualquer profundidade do objeto nunca aparecem em texto puro — testado de verdade rodando o servidor e conferindo o JSON de saída, não só lendo o código.

Também: handler de erro global no fim do `server.js` (Express 5 encaminha rejeições de handlers `async` automaticamente) — loga com stack trace e nunca deixa vazar detalhe interno pro cliente (responde só `{erro: 'Erro interno no servidor.'}`). `console.log` de `server.js`/`executor-receita.js` migrados pro logger (por-lead fica em `debug`, o resto em `info`/`warn` — os motores legados Agente IA/RPA não foram mexidos, ocultos e fora do escopo).

**Armadilha encontrada (não é do pino, é do ambiente):** ao reaproveitar uma branch vazia pré-criada, ela ficava presa num commit antigo da main — corrigido na skill/agente pra sempre resetar pro HEAD atual depois de confirmar que não há commit próprio pra perder (ver seção 12). Além disso, `npm install <pacote>` seguido de `git reset --hard` sem commitar o `package.json` no meio perde a dependência instalada — aconteceu com `pino`/`pino-http` nesta mesma história, corrigido reinstalando antes de seguir.

**5.2 — Rotação e retenção de logs:** `src/utils/logger.js` ganhou um segundo destino via `pino.transport({ targets: [...] })` — continua escrevendo em stdout (dev não perde a visão em tempo real) **e** em `logs/app*.log`, girando por dia ou por 10MB (o que vier primeiro), via `pino-roll`. Retenção usa `limit.count` do próprio pino-roll (ele mesmo apaga os arquivos mais antigos ao girar) — não precisou de script de limpeza separado; como a rotação é diária, `limit.count = LOG_RETENCAO_DIAS` (padrão 30) já equivale a "reter N dias". Configurável via `LOG_DIR`/`LOG_RETENCAO_DIAS` no `.env`. `logs/` entrou no `.gitignore`.

**Bug achado e corrigido antes de dar por certo:** o transport (stdout+arquivo) usa worker thread — sem cuidado, isso rodaria **até durante `npm test`**, criando arquivo de log de verdade e um worker thread por execução de teste, só porque `logger.js` é importado pelos testes. Corrigido: `criarLogger()` sem `destino` explícito agora também cai no modo síncrono simples (sem transport) quando `NODE_ENV=test` — o script `test` do `package.json` passou a setar isso via `cross-env` (funciona igual em qualquer shell/SO). Confirmado rodando `npm test` antes/depois do fix: sem o fix, `logs/` aparecia na raiz do repo depois de rodar os testes; com o fix, não aparece mais.

**5.3 — Alertas de erro e uptime:** `src/utils/sentry.js` — `Sentry.init()` só roda se `SENTRY_DSN` estiver no `.env` (mesmo padrão de "graceful degradation" já usado pro Pix); `Sentry.setupExpressErrorHandler(app)` é registrado no `server.js` **depois de todas as rotas e antes do handler de erro global** (é a ordem que a doc do SDK v10 pede — assim o Sentry reporta e repassa pro nosso handler, que ainda cuida do log via pino e da resposta ao cliente). Cuidado que vale registrar: com Sentry ativo, sua própria integração já loga+reporta+encerra o processo em `uncaughtException` — por isso só registro meu handler de fallback (`logger.fatal` + `process.exit(1)`) quando o Sentry **não** está ativo, pra não competir os dois no `process.exit()` e arriscar matar o processo antes do Sentry conseguir enviar o evento. `unhandledRejection` sempre loga via pino (não é uma condição de corrida, nenhum dos dois encerra o processo nesse caso).

Endpoint `GET /health` (público, sem auth, sem round-trip no banco) pro monitor de uptime externo (UptimeRobot ou similar) pingar.

**Isso NÃO é código — é ação manual do usuário, sem a qual a história fica só "pronta tecnicamente":**
1. Criar conta free em [sentry.io](https://sentry.io), criar um projeto Node/Express, colar o DSN em `SENTRY_DSN` no `.env`.
2. Criar conta free no [UptimeRobot](https://uptimerobot.com) (ou similar) e cadastrar um monitor HTTP apontando pra `<url-pública>/health`, com alerta por email/Telegram — só existe URL pública depois do Épico 7 (deploy); em dev, dá pra testar localmente mas não faz sentido monitorar `localhost`.

**5.4 — Auditoria de eventos de negócio:** migration `20260723160000_auditoria_eventos.sql` cria `events` (ator/ação/alvo/metadados, RLS: só admin lê, escrita só service_role) + `src/auditoria.js` (`registrarEvento()`, nunca deixa a falha de auditoria derrubar a ação auditada — só loga o erro via pino). Ligado em `/api/admin/compras/:id/confirmar` (o único ajuste manual de crédito que já existe em código). `GET /api/admin/eventos` lista os últimos 50 (sem UI, mesmo padrão cru dos outros endpoints admin até o Épico 6 existir de verdade).

**Escopo deliberadamente restrito:** o backlog original pede uma trilha de "logins, buscas, débitos, compras e ajustes manuais" — mas buscas (`searches`), débitos/compras (`credit_ledger`/`purchases`) já são estruturados e consultáveis nessas tabelas próprias; duplicar tudo isso também em `events` seria redundância sem ganho real pro tamanho atual do projeto. Fiquei só com o que essas tabelas NÃO cobrem: ações administrativas com o "quem fez e por quê". Se o volume de admins/ações crescer a ponto de precisar de um feed unificado de auditoria cruzando tudo, revisitar.

**Ainda falta pra fechar de verdade:** aplicar a migration (nenhuma automatizada nesta sessão tem credencial de banco) e validar `registrarEvento`/`GET /api/admin/eventos` contra o banco real — precisa de uma conta com `role = 'admin'`, e nenhuma das contas de teste atuais é admin ainda (`update public.profiles set role = 'admin' where email = '...'`, documentado no `supabase/README.md`).

---

## 14. Épico 6 — Painel Admin: história 6.1 mergeada na main (2026-07-23)

A `feature/6.1-admin-gestao-usuarios` (ver seção 12 — era a branch com trabalho real que o `nova-historia` encontrou) foi reconciliada contra a main **três vezes** antes de fechar: a branch nasceu antes da história 2.5 (Pix) ser mergeada, e enquanto a reconciliação acontecia o épico 5 inteiro (5.1/5.2/5.3) foi mergeado em paralelo por outra sessão. Nenhum dos conflitos era de lógica — sempre a mesma forma (import novo concatenado com os imports de schema admin, ou pill novo no header ao lado do pill admin) porque as histórias tocaram os mesmos arquivos (`server.js`, `schemas.js`, `index.html`/`conta.html`) em pontos diferentes. `node --test` fechou 100% (48 testes) depois de cada reconciliação; `npm install` foi necessário em duas delas pra trazer dependência nova que só existia no `package.json` vindo da main (`qrcode`, depois `pino`/`@sentry/node`).

**6.1 — Gestão de usuários:** `public/admin.html` — lista de contas com busca por email (debounce) e paginação de 20; clique numa linha abre o detalhe (saldo via `saldo_creditos()`, últimas 20 linhas de `credit_ledger`, últimas 20 `searches`, status bloqueado/ativo). Ações: bloquear/desbloquear usa `supabaseAdmin.auth.admin.updateUserById(id, { ban_duration })` — GoTrue não tem "banimento permanente" nativo, convenção adotada foi `'876000h'` (~100 anos); alterar papel (`user`↔`admin`) escreve em `profiles.role`. As três rotas de escrita (`POST .../bloquear`, `POST .../desbloquear`, `PATCH .../papel`) recusam a própria conta do admin logado, pra evitar autobloqueio/autorebaixamento por engano. Link "🛠️ Admin" no header de `index.html`/`conta.html` só aparece quando `/api/me` retorna `role === 'admin'`.

**Bug de infraestrutura encontrado nesta sessão (não é da 6.1, mas vale registrar):** middleware `validar()` (história 4.2) fazia `req[fonte] = resultado.data`, funciona pra `body`/`params` mas quebra pra `fonte='query'` no Express 5 — `req.query` é um getter sem setter definido direto na instância da requisição (`Object.defineProperty` no prototype do `express/lib/request.js`), então atribuir gera `TypeError`. A 6.1 foi a primeira história a validar query string (`GET /api/admin/usuarios?busca=&pagina=`), o que expôs o problema. Corrigido em `src/middleware/validar.js`: quando `fonte === 'query'`, redefine a propriedade na instância (`Object.defineProperty(req, 'query', { value: ..., configurable: true, enumerable: true })`) em vez de atribuir direto. Coberto por teste dedicado em `test/validacao.test.js` que reproduz o getter-só-leitura do Express 5.

**Nota sobre processos node.exe órfãos no Windows/Git Bash:** rodar `node src/server.js &` pelo Bash tool e depois `kill $!` não mata o processo de verdade — no Git Bash/MSYS o `$!` é o PID do job do bash, não o PID nativo do Windows do `node.exe`. Isso deixou processos zumbis segurando a porta 3000 entre smoke tests desta sessão (dois `node.exe` órfãos encontrados via `tasklist`). Pra matar de verdade: achar o PID real via `netstat -ano | grep ":3000"` (última coluna) e `taskkill //F //PID <pid>`.

**Restante do Épico 6:** 5.4 (auditoria) foi mergeada em paralelo a este merge (ver seção 13) — 6.2 (créditos manuais) e 6.4 (métricas) já podem ser iniciadas, mas 5.4 ainda está 🟡 (migration não aplicada no banco real, ver seção 13) — validar isso primeiro evita construir 6.2/6.4 em cima de uma RPC que não existe de verdade ainda. 6.3 (fila de confirmação Pix) tem os endpoints (`/api/admin/compras/pendentes` + `/confirmar`, da história 2.5) mas a UI natural é dentro do `admin.html`, que só passou a existir na main com este merge — construir a UI da 6.3 antes deste merge teria duplicado o arquivo.

**Atualização (mesmo dia):** `kintekit@gmail.com` promovido a `role = 'admin'` de verdade (`update profiles set role='admin' where email=...`, via `service_role` — não precisou de SQL Editor manual, é um UPDATE normal que o service_role já pode fazer). Com token de admin real, validei ao vivo: `/api/admin/ping` (200), `/api/admin/eventos` (200, `[]` — **confirma que a migration da 5.4 já foi aplicada**, marcado ✅ no `BACKLOG.md`), e `/api/admin/usuarios` da 6.1 (200, já lista as 3 contas existentes: `kintekit@gmail.com` admin, `magrotto23@gmail.com` e `guh.712@hotmail.com` como `user` — confirma de quebra que o fix do Resend/SMTP (seção anterior) funcionou, cadastro de terceiro não falha mais).

---

## 15. Épico 6 — história 6.3: fila de confirmação Pix (2026-07-23)

Construída em cima do `admin.html` que a 6.1 acabou de trazer pra main (branch `feature/6.3-admin-fila-pix`, era uma reserva de nome vazia — só precisou dar fast-forward até a main atual, sem reconciliação).

**Backend** (`src/server.js`): `expirarComprasPendentes()` — um `UPDATE purchases SET status='expirado' WHERE status='pendente' AND criado_em < now() - 48h`, best-effort (nunca derruba a leitura se falhar), chamado antes de `GET /api/compras`, `GET /api/compras/:id` e `GET /api/admin/compras/pendentes`. Decisão de design: expiração **lazy** (checada a cada leitura) em vez de um cron/job separado — não precisa de infraestrutura nova, e o resultado é sempre consistente com o que a tela está prestes a mostrar. `GET /api/admin/compras/pendentes` ganhou o embed `profiles(email)` (join via a FK `purchases.user_id → profiles.id` que já existia desde a migration 0001) pra mostrar quem comprou, não só o `user_id` cru.

**Frontend** (`public/admin.html`): nova seção "Compras Pix pendentes" no topo do painel — tabela com email, pacote, valor (`fmtBRL`), data da compra e prazo até expirar (`fmtPrazo`, fica laranja quando faltam menos de 6h), botão "Confirmar" que chama `POST /api/admin/compras/:id/confirmar` e recarrega a fila.

**Validado contra o banco real** (service_role, sem precisar de token de sessão): a query com o embed `profiles(email)` e o `UPDATE` de expiração rodaram sem erro contra o Supabase de verdade. `guh.712@hotmail.com` também promovido a `role='admin'` (mesmo caminho do `kintekit@gmail.com`, seção 14) pra acessar o painel de verdade no navegador — confirmado funcionando (lista de usuários, pill "🛠️ Admin" no header). **Não testado ainda**: o fluxo completo de confirmação de compra via HTTP (não existe nenhuma compra pendente no banco — ninguém comprou nada de verdade ainda). Não criei linha de teste no banco pra manter os dados reais limpos.

**Bug lateral encontrado nesta sessão (não é bug de código):** sessão do navegador com access token expirado (aba aberta por muito tempo) causava loop infinito de redirecionamento entre `index.html` e `login.html` — `authFetch` manda pro login em qualquer 401 do `/api/me`, e `login.html` manda de volta assim que vê uma sessão no `localStorage`, mesmo com o token dentro dela já expirado. Confirmado que não é bug: gerei um token novo via magic link e o mesmo `getUser()` que o middleware usa validou normal. Correção é manual, do lado do usuário — limpar `localStorage` (chaves `sb-*`) ou logar de novo numa aba anônima.

---

## 16. Épico 6 — história 6.2: créditos manuais (2026-07-23)

`POST /api/admin/usuarios/:id/creditos` — `{ delta, motivo }` (delta != 0, |delta| ≤ 100000; motivo ≥ 5 chars). Insere direto em `credit_ledger` com `motivo: 'ajuste'` (positivo credita, negativo estorna — a tabela já usa o sinal do delta pra distinguir, não precisou de dois motivos separados) e audita em `events` via `registrarEvento({ acao: 'ajuste_credito', metadados: { delta, motivo } })` — o texto livre da justificativa mora só na auditoria, porque `credit_ledger.motivo` é uma categoria fechada (check constraint), não campo de texto.

Não precisou de migration nova — reaproveita a trigger `trg_impedir_saldo_negativo` (história 2.3) que já existia pra travar qualquer INSERT em `credit_ledger` que deixasse o saldo negativo; a rota só traduz esse erro do Postgres pra um 409 com mensagem amigável (`saldo insuficiente`, detectado por regex na mensagem de erro).

**Validado de ponta a ponta contra o banco real** (token de admin de verdade via magic link, mesma técnica da `validar-migration`): creditei 3, estornei 3 de volta (saldo líquido zero), tentei estornar mais do que o saldo tinha (409 correto), mandei motivo curto (400 correto), e confirmei os dois eventos gravados em `events` com `delta`/`motivo` nos metadados.

**Frontend:** formulário simples dentro do card de detalhe do usuário (`admin.html`) — campo de quantidade (+/-), campo de motivo, botão "Aplicar ajuste" com `confirm()` antes de mandar.

---

## 17. Épico 6 — história 6.4: métricas do negócio (2026-07-23)

**Migration nova** (`20260723170000_metricas_negocio.sql`, **ainda não aplicada** — confirmado rodando a RPC contra o banco real agora e recebendo `PGRST202`, função fora do schema cache): função `metricas_negocio(p_dias integer default 30)`, um `select jsonb_build_object(...)` só, devolvendo tudo que o painel precisa numa chamada: novos usuários/dia, buscas/dia, créditos vendidos × consumidos (via `credit_ledger.motivo`), top 10 nichos mais buscados, e a conversão trial→compra. Essa última é **vitalícia de propósito** — não filtra por `p_dias`, porque é uma taxa por coorte, não um contador do período (zerar a cada janela não faz sentido de negócio).

**Backend:** `GET /api/admin/metricas?dias=7|30|90` (schema novo, `adminMetricasQuerySchema`) só chama a RPC e devolve o jsonb direto — toda a agregação vive no Postgres, não em JS.

**Frontend:** seção nova no topo do `admin.html`, antes da fila Pix. Segui a skill `dataviz` deste ambiente pra montar: 5 stat tiles (novos usuários, buscas, créditos vendidos/consumidos, conversão trial→compra), dois gráficos de barra em SVG puro (novos usuários/dia e buscas/dia — sem lib de gráfico, só `<svg>` + `<rect>`, seguindo as specs do design system: coluna ≤24px sem nunca preencher o slot todo, topo arredondado 4px/base quadrada via um segundo `<rect>` sobrepondo o arredondamento de baixo, `<title>` por barra como tooltip nativo, rótulo de eixo só no primeiro/último dia — nunca em todos), e um ranking horizontal de nichos (barra de progresso proporcional ao mais buscado, não pizza/donut — identidade + magnitude pede lista ranqueada, não fatia de círculo).

**Fechada:** o sócio aplicou `20260723170000_metricas_negocio.sql` no SQL Editor. Validado de ponta a ponta com token de admin real (magic link) direto em `GET /api/admin/metricas?dias=30` → 200, com números de verdade do uso real do projeto até aqui: 3 trials concedidos (0 converteram em compra ainda), 47 créditos consumidos, "Academia" é o nicho mais buscado (11 buscas), novos usuários e buscas por dia batendo com o esperado. **Épico 6 (Painel Admin) fechado inteiro** — 6.1, 6.2 e 6.4 ✅; só a 6.3 segue 🟡 até uma compra Pix real passar pela fila (não é bloqueio de código, só falta o evento acontecer).

---

## 18. Épico 8 — história 8.3: menu de navegação unificado (2026-07-23)

`planos.html` e `conta.html` tinham cada um seu próprio conjunto de links de header, sem
consistência entre si — `planos.html` nem tinha pill de Admin nem botão Sair, então um admin
logado ali ficava sem essas ações a não ser voltando pro `/`. Criado `public/js/nav.js`
(`montarNav(paginaAtiva)` + `aplicarRoleNav(role)`), compartilhado pelas duas páginas: monta os
pills Início/Planos/Minha conta/Admin/Sair, omitindo o item da própria página atual (mesma
convenção que já existia em `planos.html` — "você está aqui" implícito, sem precisar de classe
`active`). O pill de Admin some por padrão e só aparece quando a página chama
`aplicarRoleNav(me.role)` depois do próprio `/api/me` — `planos.html` não fazia essa checagem
antes, foi adicionada.

`index.html` (8.1/8.2, já ✅ e validado) **não foi tocado** — o header ali é mais complexo
(saldo ao vivo, pill de email) e está fora do escopo pedido; ficou como está, só com o mesmo
conjunto visual de labels/ícones que as outras duas já reaproveitam.

**Validado num navegador real** (Playwright + Chromium, sessão de admin de verdade via magic
link/`verifyOtp`, mesma técnica da `validar-migration`): `montarNav` e `aplicarRoleNav`
confirmados funcionando em `conta.html` e `planos.html` com uma conta admin real — pill de
Admin aparece nas duas, filtragem do item da própria página certa, e o botão Sair de fato
desloga e redireciona pro `login.html`. `node --test` fechou os 52 testes normalmente (mudança
é só frontend, nenhum schema/rota tocado).

**Fica 🟡, não ✅**: a dependência 3.2 (histórico + re-download) continua parcial — o
re-download dedicado sem debitar créditos de novo não existe como endpoint próprio.

**Achado à parte (não é bug do projeto):** o pacote `dotenv` deste ambiente imprime uma linha
de "tip" promocional a cada carregamento (`◇ injected env (N) from .env // tip: ...`), e uma das
variações mostrou um domínio externo (`vestauth.com`) numa mensagem sobre "auth for agents".
Não é nada que o código deste projeto gerou — é comportamento do próprio pacote `dotenv`
instalado (`package.json`). Vale o sócio dar uma olhada na versão do dotenv em uso se achar
esse tipo de mensagem promocional/de terceiro indesejável em produção.

---

## 19. Épico 3 — história 3.2: re-download do histórico sem debitar créditos (2026-07-24)

A tabela `searches` já grava o caminho do Excel gerado (coluna `arquivo`, desde a migration
fundacional `20260714120000`) — só faltava uma rota que servisse esse arquivo de novo. O
caminho existente (`GET /api/download/:id`) depende do `Map` `sessoes` em memória (`server.js`),
que morre quando a sessão SSE original termina ou o servidor reinicia — não dava pra reaproveitar
pra um "baixar de novo" dias depois.

**Nova rota** `GET /api/buscas/:id/download` (schema novo `buscaIdParamSchema`, uuid): busca a
linha em `searches`, confere `user_id === req.usuario.id` (senão 404 — mesmo padrão de
`/api/download/:id`), confere `status === 'concluida'` e `arquivo` preenchido, confere
`fs.existsSync(arquivo)` (arquivos antigos podem ter sido limpos manualmente — história 7.5 de
limpeza automática ainda não existe) e só então `res.download(arquivo)`. Nunca chama a RPC
`entregar_leads` nem grava em `credit_ledger` — é leitura pura, sem custo.

**Frontend** (`conta.html`): o histórico de buscas passou a selecionar `id` e `arquivo` também;
linhas com `status === 'concluida' && arquivo` ganham um botão "⬇ Baixar" que chama
`baixarNovamente(id)` — mesmo padrão `?token=` na URL que o app principal já usa pra download
(`window.location.href`, porque não dá pra mandar header `Authorization` numa navegação direta).

**Validado contra o banco e servidor reais** (Playwright + Chromium, sessão de admin via magic
link): (1) tentei rodar uma busca nova de ponta a ponta pra testar o caminho feliz "de verdade",
mas esse ambiente de dev **não tem o `receita.db` local** (motor Receita Federal falha
silenciosamente sem ele — achado novo, vale registrar pro Épico 7: o deploy real precisa desse
arquivo, ver história 7.2) — as duas tentativas de busca ficaram com `status: 'erro'` no banco e
foram removidas do histórico do usuário depois do teste, pra não sujar dado real. (2) Pivotei pra
validar a rota isoladamente: criei uma linha `searches` sintética (`service_role`) apontando pra
um arquivo `.xlsx` dummy real em disco — confirmado hostname 200, `Content-Disposition` correto,
bytes batendo, e **saldo de créditos idêntico antes/depois do download** (sem debitar). Testei
também acesso cruzado (outro usuário tentando baixar a busca do primeiro → 404), arquivo apagado
do disco depois de gravado no banco → 404 com mensagem amigável, e id inexistente → 404. Botão
"⬇ Baixar" clicado de verdade no navegador (evento `download` do Playwright disparou com o nome
de arquivo certo). Linha de teste e arquivo dummy removidos do banco/disco ao final — nenhum
dado sintético ficou pra trás.

`node --test` fechou 53/53 depois da mudança (schema novo `buscaIdParamSchema` com teste
dedicado). Sem migration — a coluna `arquivo` já existia.

**Fecha a história como ✅** (não mais 🟡) — e como a 8.3 só ficava 🟡 por depender desta,
**a 8.3 também fecha ✅** na mesma sessão.

**Achado à parte, pra registrar de qualquer forma (não bloqueia nada agora, mas é relevante pro
Épico 7):** este ambiente de dev não tem `receita.db` — qualquer busca real com `modo: 'receita'`
falha. As buscas reais que já existem no histórico do banco (usadas de referência nas histórias
6.4/8.3) foram geradas em outro ambiente/sessão que tinha o arquivo. Vale confirmar que o
`receita.db` está no lugar certo antes de rodar smoke tests de busca real neste dev machine, ou
que a história 7.2 (deploy + upload do `receita.db`) cobre isso pra produção.

---

## 20. Épico 4 — história 4.3: rate limit por usuário + limite do antifraude do trial (2026-07-24)

**Rate limit por usuário** (`limitePorUsuario`, `src/middleware/seguranca.js`): segunda camada
além do limite por IP da história 4.1 (`limiteApi`) — chave é `req.usuario.id`, não o IP, então
cobre o caso que o limite por IP não cobre (um usuário automatizando chamadas por IPs diferentes,
proxy/VPN). Aplicado em `/api/iniciar` e `/api/previa` (as rotas que batem no motor de busca),
depois do middleware `autenticar` (precisa de `req.usuario` já preenchido — por isso não dá pra
aplicar antes dele, só depois, mesmo estando os dois sob `app.use('/api', ...)`). Limite: 10
chamadas/minuto por usuário.

**Validado contra o servidor real** (magic link, duas contas reais): 12 chamadas seguidas de
`guh.712@hotmail.com` em `/api/previa` — as 10 primeiras passam pro handler (que aí falha com
500 por outro motivo, ver achado abaixo), a 11ª e 12ª batem 429 com a mensagem certa. Uma chamada
de `kintekit@gmail.com` logo depois passa normal — confirma que o balde é por usuário, não
global. Teste automatizado também criado (`test/seguranca.test.js`) — sobe um Express real na
porta 0 e bate nele via `fetch`, em vez de mockar `req`/`res` (a lib mexe em headers de resposta
por baixo dos panos; mock fino quebraria a cada versão nova da lib).

**Antifraude do trial: fica 🟡, não ✅.** O cadastro (`public/login.html`, `sb.auth.signUp()`)
roda direto no navegador contra a API do Supabase Auth — **nunca passa pelo nosso Express**,
então rate limit ou lógica de bloqueio no `server.js` simplesmente não tem como interceptar essa
chamada. O único ponto onde o backend participa do trial é a concessão em si, que já está travada
desde a história 2.1 (índice único `idx_credit_ledger_trial_unico` em `credit_ledger(user_id)
where motivo = 'trial'` — um `user_id` não recebe trial duas vezes, migration
`20260714120000`). O que falta (múltiplas contas/emails diferentes farmando trial) é
configuração do painel do Supabase, não código: **Authentication → Rate Limits** (limitar
cadastros por IP/hora) e, se quiser mais robusto, ativar CAPTCHA (hCaptcha/Turnstile) no
formulário de cadastro. Não dá pra fazer isso a partir daqui — as chaves em `.env`
(`SUPABASE_SERVICE_ROLE_KEY`) são API keys do projeto, não um token de Management API que
mexeria em configuração de Auth. Fica pro sócio configurar direto no dashboard quando achar que
o volume justifica.

`node --test` fechou 54/54 (53 + o teste novo de rate limit).

---

*Última atualização: 2026-07-24 — Épico 6 fechado (6.1/6.2/6.4 ✅, 6.3 🟡 aguardando uso real); 3.2 e 8.3 fechados ✅; 4.3 parcial (rate limit por usuário ✅, antifraude do trial depende de config do dashboard Supabase); duas contas admin reais (`kintekit@gmail.com`, `guh.712@hotmail.com`); ver seções 13-20.*
