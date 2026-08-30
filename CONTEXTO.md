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

## 21. Épico 4 — história 4.4: acesso cruzado bloqueado por RLS, validado contra o banco real (2026-07-24)

Não teve código novo — o RLS já estava correto desde a fundação (histórias 0.2/1.4): cada
tabela sensível (`profiles`, `credit_ledger`, `searches`, `purchases`, `delivered_leads`) só tem
policy de `select` com `using (auth.uid() = user_id)` (ou `= id` em `profiles`), sem nenhuma
policy de insert/update/delete pra `authenticated` — só o `service_role` (que o backend usa)
escreve. Faltava só a prova de que isso segura na prática, com contas reais, não só lendo o SQL.

**Metodologia** (duas contas reais via magic link, cliente anon autenticado como cada uma —
mesma técnica da `validar-migration`): logado como `guh.712@hotmail.com` (conta A), tentei ler e
escrever dados de `kintekit@gmail.com` (conta B, que **tem** linhas reais em `credit_ledger` e
`searches`, confirmado via `service_role` antes do teste — pra não validar contra uma tabela
vazia e ter falso positivo).

- **Leitura cruzada bloqueada** em todas as 5 tabelas: `profiles`, `credit_ledger`, `searches`,
  `purchases`, `delivered_leads` — filtrando explicitamente por `user_id = <id de B>` sempre
  voltou 0 linhas pro cliente de A, mesmo com B tendo dado real nas duas primeiras. Um
  `select('*')` sem filtro em `profiles` também nunca trouxe a linha de B — RLS filtra
  silenciosamente, não é um erro, é como se a linha não existisse pro cliente de A.
- **Escrita cruzada bloqueada**: tentativa de `INSERT` direto em `credit_ledger` (bypassando o
  backend) foi **rejeitada com erro explícito do Postgres** ("new row violates row-level
  security policy"). Tentativa de `UPDATE role='admin'` na linha de B em `profiles` **não deu
  erro, mas afetou 0 linhas** — achado importante do processo: a primeira rodada do teste só
  checava `error === null` e reportou falso positivo ("PASSOU!"), porque RLS filtra o `UPDATE`
  como se a linha não existisse — sem erro, sem linha afetada. Corrigido encadeando `.select()`
  no `.update()` pra inspecionar as linhas realmente afetadas (`dataUpdate: []`, confirmando
  bloqueio de verdade). **Lição pra qualquer teste de RLS futuro**: nunca confiar só em
  `error === null` num update/delete pra provar que "passou" — sempre conferir o array de linhas
  afetadas, porque RLS nega por filtragem silenciosa, não por exceção.

Nenhum dado real foi alterado (a tentativa de promoção de B não teve efeito, e B já era admin
antes — sem side-effect de qualquer forma). Scripts de validação eram só ad-hoc (mesmo padrão de
`validar-migration`), removidos depois — não fica um teste permanente em `test/*.test.js` porque
depende de credenciais reais e duas contas existentes no banco, o que não cabe no `node --test`
padrão (que roda offline, sem rede).

**Fecha a história como ✅.**

---

## 22. Épico 8 — história 8.4: erros amigáveis e estados vazios (2026-07-24)

Levantamento (`grep alert(`) achou 8 usos de `alert()` cru na interface: 4 em `index.html`, 3
em `planos.html`, 1 em `admin.html`. Trocados os 7 do produto (não do painel admin — ver
motivo abaixo), cada um pelo padrão já existente mais próximo em vez de inventar um componente
novo:

- **`index.html`**: os dois "Preencha todos os campos antes de iniciar" (em `confirmarBusca()` e
  `iniciar()`) viraram um banner inline (`#formErro`, vermelho, mesmo tom de `--red` já usado no
  resto do design system) + destaque nos campos vazios (`.campo-invalido`, borda vermelha) —
  refeito como `validarCampos()` centralizado, chamado pelas duas funções, com um listener de
  `input` que limpa o destaque sozinho assim que o usuário corrige o campo (não precisa clicar
  em "Iniciar Busca" de novo só pra ver que já corrigiu). O erro de prévia e o "nenhum lead novo
  encontrado" viraram `addLog('error', ...)` / `addLog('info', ...)` — reaproveitando o painel
  "Atividade em Tempo Real" que já existe e já tem esse padrão de ícone+cor pra eventos de busca
  (`error`/`info`/`search`/`lead` etc.), em vez de um popup bloqueante.
- **`planos.html`**: erro ao iniciar a compra virou um banner inline no topo da página (mesmo
  padrão visual do `formErro` de `index.html`, classe `.erro-inline`). O feedback de "copiado"/
  "erro ao copiar" do código Pix virou troca do próprio texto do botão (`✓ Copiado!` por 2s) em
  vez de alert — não bloqueia a tela pra uma confirmação tão trivial.
- **`admin.html` ficou de fora de propósito** — só tem 1 `alert()` (erro ao confirmar compra
  Pix), mas é território do Épico 6 (**responsável: sócio**) — mexer lá sem alinhar antes viola
  a convenção já registrada no `BACKLOG.md` pra esse épico.

**Validado num navegador real** (Playwright + Chromium, sessão real): confirmei que nenhum
`alert()`/`confirm()` nativo dispara mais nesses dois fluxos (handler de `dialog` no teste
provaria a regressão se disparasse), que o banner e o destaque de campo aparecem corretamente
quando os campos estão vazios, que digitar no campo limpa o destaque sozinho, e que o banner de
erro de compra mostra a mensagem real do backend (`Pix ainda não configurado...`) em vez de travar
a tela. `node --test` seguiu 54/54 — mudança 100% frontend, nenhuma rota/schema tocado.

**Fecha a história como ✅** pro escopo do produto (`index.html`/`planos.html`); o `alert()`
restante em `admin.html` fica registrado aqui como pendência conhecida e pequena, não
bloqueadora, pro sócio decidir se/quando mexer.

---

## 23. MCP do Supabase conectado + bug crítico corrigido: `anon` confirmava compra Pix sem pagar (2026-07-25)

Complementando a seção 12 (agente e skills): o repo agora também tem `.mcp.json` configurado,
apontando pro servidor MCP oficial do Supabase (`https://mcp.supabase.com/mcp`). Dá ao Claude
Code acesso direto ao projeto **KintekIT** (schema real, migrations, logs, advisors de
segurança/performance) sem precisar colar SQL manualmente no SQL Editor toda vez. Conexão exige
OAuth (`/mcp reconnect all` dentro do Claude Code, login pela conta Supabase, selecionar o
projeto). Documentado no `README.md` pro sócio saber que existe e como ligar na própria máquina.

**Primeiro uso já achou um bug real em produção.** Rodando `get_advisors(type=security)` +
confirmando com `has_function_privilege` direto no Postgres: `confirmar_compra(uuid)` (história
2.5, `SECURITY DEFINER`) estava executável pelo role `anon` — **qualquer requisição sem login**,
usando só a anon key pública, conseguia chamar `POST /rest/v1/rpc/confirmar_compra` com um
`purchase_id` (visível pro próprio comprador ao criar a intenção de compra) e creditar a conta
**sem pagar nada de verdade via Pix**. Como é `SECURITY DEFINER`, roda com privilégio elevado e
ignora RLS — RLS não protegia esse caminho.

**Causa raiz, sistêmica:** o Supabase concede `EXECUTE` a `anon`/`authenticated` por padrão em
toda function nova do schema `public` (via `ALTER DEFAULT PRIVILEGES` do próprio provisionamento
do projeto). Todas as migrations anteriores só escreviam `revoke execute ... from public,
authenticated` — nunca revogavam de `anon` explicitamente. Revogar de `PUBLIC` (pseudo-role) não
remove o grant que o `anon` já tem por conta própria, então o acesso do `anon` nunca saiu.
**Vale pra qualquer function nova daqui pra frente: sempre revogar de `anon` também, não só
`public`/`authenticated`** (já ajustado no `lead-agent-dev.md`).

`conceder_trial()`/`handle_new_user()` tinham o mesmo grant indevido mas não eram exploráveis de
fato (são `returns trigger` — o Postgres recusa chamada direta fora de contexto de trigger).
`entregar_leads`/`contar_novos`/`metricas_negocio`/`saldo_creditos` também tinham `anon` com
`EXECUTE`, mas por não serem `SECURITY DEFINER`, o RLS (sem nenhuma policy de INSERT/UPDATE, só
SELECT da própria linha) já bloqueava dano real — corrigidas mesmo assim, por defesa em
profundidade e pra bater com o comentário original de cada uma.

**Fix aplicado e validado em produção:** migration
`supabase/migrations/20260725180000_revoga_execute_anon_rpcs_sensiveis.sql`, revogando `EXECUTE`
de `anon`/`authenticated`/`public` e deixando só `service_role` nas 7 funções. Confirmado antes
que nenhuma delas é chamada do frontend (só via `supabaseAdmin`/service_role no backend). A
chamada via `mcp__supabase__apply_migration` foi bloqueada pelo classificador de auto-mode do
Claude Code (DDL direto em produção via MCP não passa sem aprovação explícita) — aplicada pelo
usuário colando a migration no SQL Editor. Validado depois com `has_function_privilege` e
`get_advisors`: `anon`/`authenticated` sem acesso a nenhuma das 7, advisor de segurança limpo.

**Pendência que sobrou, sem solução por ora:** `auth_leaked_password_protection` (checagem de
senha vazada contra o HaveIBeenPwned.org) segue desativada — **não dá pra ligar no plano Free**
do projeto. Confirmado tentando de verdade pelo dashboard (Authentication → Sign In/Providers →
Email → "Prevent use of leaked passwords"): o toggle deixa marcar, mas o Supabase recusa ao
salvar com `"Configuring leaked password protection via HaveIBeenPwned.org is available on Pro
Plans and up."`. Fica bloqueado até decidirem fazer upgrade de plano.

**Achados de performance, não corrigidos (baixa urgência):** 6 policies RLS reavaliam
`auth.uid()` por linha em vez de `(select auth.uid())` (gargalo conhecido do Supabase, só dói em
escala); FK sem índice em `delivered_leads.search_id`; 3 índices nunca usados (esperado, tabelas
ainda novas).

---

## 24. Épico 7 — Infraestrutura & Deploy: código/scripts prontos, sem VPS real ainda (2026-07-25)

Implementadas as 6 histórias do Épico 7 (7.1-7.6) numa sequência só, seguindo o fluxo padrão
(branch por história → commit → merge na `main`). **Nenhuma foi validada contra infraestrutura
real** — não existe VPS nem domínio contratado neste momento; tudo em `deploy/` (script +
`deploy/README.md`, o guia mestre) foi escrito, revisado e teve a sintaxe checada (`bash -n` nos
`.sh`), mas o "golden path" de verdade só acontece quando alguém provisionar um servidor de
verdade e seguir o guia. Marcadas 🟡 no `BACKLOG.md`, não ✅, por isso.

- **7.1** — `deploy/setup-vps.sh`: usuário `deploy` sudo sem senha de root, SSH só por chave
  (sem root remoto, sem senha), UFW (22/80/443), fail2ban, `unattended-upgrades`, timezone
  `America/Sao_Paulo`, swap de 2GB (ajuda o `npm install` do `better-sqlite3` e o import da
  Receita, pesados de memória), Node LTS + `pm2`.
- **7.2** — `deploy/ecosystem.config.js` (pm2) + `deploy/deploy.sh` (`git pull` + `npm ci` +
  `pm2 reload`, zero-downtime). Guia de transferência do `data/receita.db` (~10,7GB) via `rsync
  --partial` (retomável, não recomeça do zero se cair a conexão — importante pra um arquivo
  desse tamanho).
- **7.3** — `deploy/Caddyfile` (reverse proxy + HTTPS automático via Let's Encrypt, sem
  `certbot`/cron manual). **Achado durante a implementação, corrigido junto:** `src/server.js`
  não tinha `app.set('trust proxy', ...)` — atrás de um reverse proxy, o `express-rate-limit`
  (histórias 4.1/4.3) veria todo mundo vindo do IP do próprio Caddy, quebrando o rate limit por
  IP/usuário silenciosamente assim que fosse pra produção. Corrigido com `app.set('trust proxy',
  1)` (confia só no primeiro hop — o Caddy no mesmo VPS — nunca numa cadeia de
  `X-Forwarded-For` vinda do cliente, o que deixaria o cliente falsificar o próprio IP). Testes
  (`node --test`) seguiram 54/54 depois da mudança.
- **7.4** — `.github/workflows/deploy.yml`: job de teste (`npm test`, com
  `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` pra não baixar browser à toa — os testes deste repo não
  abrem browser) + job de deploy via SSH (`appleboy/ssh-action`) que só roda em push direto pra
  `main` (não em PR) e só depois do job de teste passar. Precisa de 3 secrets no GitHub
  (`DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY`, com uma chave SSH dedicada só pro CI, nunca a
  pessoal) — documentado no guia. **Nunca rodou de verdade** — só validação de sintaxe local.
- **7.5** — `deploy/limpeza-diaria.sh` (cron): apaga `leads/*.xlsx` com mais de 30 dias e
  `logs/pm2-*.log` com mais de 14 dias (os logs da própria app já são rotacionados sozinhos pelo
  `pino-roll`, história 5.2 — isso aqui só cobre o que o pm2 escreve por fora disso). Documentado
  que `data/receita.db` **não precisa** de backup (regenerável a partir dos ZIPs da RFB) e que o
  banco Postgres **precisa mas não tem automático** — confirmado na doc oficial do Supabase que
  o plano Free não inclui backup diário nem PITR (só Pro+); recomendação é `supabase db dump`
  manual e periódico até decidirem fazer upgrade.
- **7.6** — `deploy/atualizar-receita-mensal.sh`: baixa os 22 ZIPs do mês da RFB, reimporta num
  banco **separado** (nunca toca no `receita.db` que a aplicação está lendo ao vivo), consolida o
  WAL (`PRAGMA wal_checkpoint(TRUNCATE)` — sem isso um `mv` só do `.db` perderia o que ainda não
  tinha sido escrito no arquivo principal) e só then troca atomicamente, mantendo 1 geração
  anterior (`receita.db.anterior`) como válvula de escape pra reverter. Depois da troca, dá
  `pm2 restart` — necessário porque o processo em memória mantém o handle do arquivo antigo
  aberto por inode até reiniciar, mesmo depois do nome "receita.db" apontar pro arquivo novo.
  **Ressalva importante:** não consegui confirmar ao vivo a URL/estrutura de pastas da RFB
  (`arquivos.receitafederal.gov.br` bloqueia fetch automatizado — bati 404 tanto pela raiz quanto
  numa pasta de mês específico, mesmo a URL aparecendo indexada numa busca). O padrão usado no
  script é o documentado/usado por outros projetos que consomem essa base e bate com os mesmos 22
  nomes de arquivo que `importar-receita.js` já espera, mas o guia deixa explícito: **rodar um
  dry-run manual antes de confiar nisso sozinho no cron**.

**Recomendação de disco revisada:** o guia (`deploy/README.md`) agora pede 60GB de disco no VPS,
não 40GB — a atualização mensal precisa de ~35GB livres durante a troca (banco atual + anterior
mantido + banco novo sendo construído + ZIPs baixados).

**Próximo passo real:** contratar VPS + domínio e seguir `deploy/README.md` na ordem. Cada seção
termina com o que confirmar antes de considerar aquela história ✅ de verdade (não só 🟡).

---

## 25. Custos operacionais e checklist de go-live (2026-07-26)

Levantamento feito pra alinhar orçamento com o pessoal de marketing/comercial. **A tabela de
custos e o checklist de go-live passo a passo moram no `BACKLOG.md`** (seções "Custos
operacionais" e "Go-live — ordem sugerida") — é lá que devem ser mantidos, pra não duplicar.

Resumo do que ficou claro no levantamento:

- **Pra lançar, o custo é baixo: ~R$50/mês** (VPS ~R$45 + domínio R$40/ano; HTTPS é grátis via
  Let's Encrypt/Caddy). Supabase e Resend atendem no plano free hoje.
- **Escalado fica ~R$280/mês**, e os dois upgrades pagos existem por motivos concretos, não por
  vaidade: o **Supabase Pro (US$25/mês)** é o que libera backup automático do Postgres — hoje
  não existe nenhum, só `supabase db dump` manual (ver 7.5) — e a leaked password protection
  (seção 23). O **Resend pago (US$20-35/mês)** só entra se passarmos de 3.000 e-mails/mês.
- **O domínio é o gargalo mais barato e mais bloqueante do projeto**: R$40/ano destravam de uma
  vez o Resend (SPF/DKIM, sem o qual só o dono da conta recebe e-mail), o `APP_ORIGIN` de
  produção (CORS da 4.1) e o HTTPS do Caddy (7.3). Comprar isso antes de qualquer outra coisa é
  o passo de maior alavancagem no backlog inteiro.

Nenhum item novo de código saiu daqui — foi consolidação de pendências que já estavam espalhadas
entre as seções 13-24, as anotações de desenvolvimento dos sócios e o `deploy/README.md`.

---

## 26. Homologação com gestores: CNAE errado no nicho "consultório ambiental" — causa raiz e fix (2026-08-17)

Feedback de homologação (planilhas de `consultorio_ambiental` e `contabilidade` em `leads/`,
geradas pra validação com os gestores): a taxa de retorno dos contatos foi baixa (8 em 80) e,
mais grave, o gestor apontou que a planilha de "consultório ambiental" trazia CNAEs sem relação
nenhuma com o nicho — escritório de advocacia, consultoria de TI, auditoria atuarial etc.

**Causa raiz, sistêmica (não era só um sinônimo faltando):** `expandirTermos`
(`src/tools/receita.js`) expande cada *palavra* do nicho digitado em termos e casa qualquer CNAE
cuja descrição contenha **qualquer um** deles — é um OR entre todas as palavras, não um AND. Pra
nicho de uma palavra só isso é inofensivo. Pra nicho composto, a palavra "consultório" virava o
stem `CONSULTOR` (corte automático de sufixo pra casar variações), que bate em **qualquer**
"Consultoria..." do CNAE — TI, atuarial, contábil, publicidade, agronegócio — sem relação com meio
ambiente. O mesmo vale pra "clínica" (bate em laboratório clínico, clínica geriátrica, clínica de
estética) e "escritório" (bate em papelaria, móveis de escritório, escritores/artistas).
Confirmado comparando a descrição da atividade com o nome real das empresas retornadas na
planilha entregue.

Complicando mais: a Receita Federal **não tem uma categoria de CNAE pra "consultoria ambiental"**
— o mais próximo é uma mistura de gestão de resíduos, estudos geológicos e atividades técnicas
genéricas, que não compartilham nenhuma palavra-raiz comum com "ambiental". Corrigir só a lógica
de matching não bastava pra esse nicho específico.

**Fix aplicado** (`src/config/sinonimos-cnae.js` + `src/tools/receita.js`):
- `PALAVRAS_AMBIGUAS_PREFIXOS` (`CONSULTOR`, `ESCRITOR`, `CLINIC`): palavras de "tipo de
  estabelecimento" confirmadas contra o banco real como cruzando áreas completamente diferentes.
  `expandirTermos` agora separa as palavras do nicho em específicas vs. ambíguas e **só usa as
  ambíguas como fallback quando não sobra nenhuma palavra específica** — nunca soma (OR) as duas.
  Ex.: "consultório ambiental" busca só por "ambiental"; "consultório" sozinho (nicho de uma
  palavra) continua caindo no fallback em vez de não achar nada.
- `CNAES_POR_TERMO`: pra nichos sem palavra-raiz confiável no texto do CNAE (hoje só
  `AMBIENTAL`/`AMBIENTAIS`), mapeamento direto pra uma lista curada de 7 códigos (gestão de
  resíduos, coleta/tratamento de resíduos perigosos e não-perigosos, estudos geológicos,
  atividades técnicas de engenharia/arquitetura não especificadas) em vez de tentar achar palavra
  em comum. `expandirCodigos` soma esses códigos aos achados por texto.
- `npm run validar-sinonimos` passou a validar também que os códigos de `CNAES_POR_TERMO` existem
  de fato na tabela `cnaes` (pega erro de digitação no código).
- 5 testes novos em `test/receita-matching.test.js` travam a regressão (ambígua descartada quando
  há palavra específica; ambígua ainda funciona sozinha; código curado presente/ausente conforme
  o nicho). Suíte inteira: 59/59 passando.

**Validado gerando a planilha de novo** (`leads/leads_consultório_ambiental_são_paulo_sp_
2026-08-17T23-12-14.xlsx`, 40 leads): as 9 atividades retornadas agora são todas de gestão de
resíduos/estudos ambientais — nenhuma consultoria de TI, contábil, atuarial ou escritório de
advocacia. A planilha antiga (`leads_consultorio_ambiental_...T01-35-41.xlsx`) foi mantida na
pasta pra comparação, não apagada.

**Achado relacionado na hora de escrever esta seção:** o mesmo padrão de bug existia em
`OFICINA: 'MANUTENC'` (`SINONIMOS_NOVOS_PENDENTE_VALIDACAO`) — corrigido na sequência, ver seção
27.

**Pendência maior, deixada de fora de propósito (pedido explícito do usuário: só o CNAE por
agora):** a taxa de retorno de 8/80 aponta pra um problema mais amplo de qualidade de dado —
telefone/e-mail real vs. desatualizado na base da Receita, não só CNAE certo. Não investigado
nesta sessão.

---

## 27. Auditoria completa do dicionário de sinônimos CNAE — mais 5 bugs do mesmo padrão (2026-08-17)

Depois da seção 26, o usuário pediu pra corrigir o achado do `OFICINA`/`MANUTENC` e "qualquer
outro bug que eu venha a identificar". Em vez de corrigir só esse, rodei um script que simula
`expandirTermos` + o matching real pras 72 chaves do dicionário inteiro contra `data/receita.db`
e inspecionei manualmente toda entrada com mais de 6 CNAEs batendo. Achou mais 5 bugs reais, todos
por colisão de substring/raiz genérica demais — o mesmo padrão da seção 26, não casos isolados.

**Bugs achados e causa:**
- **`PET` (21 CNAEs)** — "pet" é prefixo literal de "petróleo" e aparece no meio de "espetáculo"
  (es-**pet**áculo). Nicho "petshop"/"pet" trazia extração de petróleo, petroquímica, produção de
  espetáculos circenses.
- **`BAR` (13 CNAEs)** — "bar" é prefixo de "barragem"/"barro" e aparece no meio de "embarcações"
  (em-**bar**cações). Nicho "bar" trazia construção naval, barragens, cerâmica.
- **`MOVEIS` (27 CNAEs)** — "móveis" aparece no meio de "automóveis" e "imóveis". Nicho "móveis"
  (loja de móveis) trazia concessionária de carro e imobiliária.
- **`SEGUROS` (22 CNAEs)** — o corte automático de sufixo (stem) reduzia "SEGUROS" (7 letras) pra
  "SEGUR" (5 letras), que colide com "segur-ança". Nicho "seguros" (corretora) trazia EPI,
  vigilância privada e vidro de segurança.
- **`TRANSPORTADORA` (55 CNAEs) e `AUTOPECAS` (58 CNAEs)** — raiz curada boa demais no sentido
  errado: "transporte" cobre todo modo de transporte (inclusive transporte espacial, metrô, avião
  de passageiro) e ", peças e acessórios" é sufixo padrão de dezenas de categorias industriais sem
  relação (fabricação de instrumento musical, móveis, máquina de escritório). Não eram acidente de
  substring — a própria raiz escolhida era ampla demais pro que o nicho realmente significa no uso
  comum (frete/carga; peça de veículo).

**Fix estrutural, resolve a classe toda (não só os 4 casos achados):**
- `casaTermo()` (`src/tools/receita.js`): termo de uma palavra só agora só casa se aparecer no
  **início** de uma palavra da descrição, nunca no meio — resolve `MOVEIS` por completo e reduz
  bastante `PET`/`BAR` (o resíduo de ambos foi zerado pela regra abaixo). Termo de frase (com
  espaço, ex.: "ANIMAIS DE ESTIMACAO") continua checado como substring simples — já é específico o
  bastante.
- `expandirTermos`: palavra de 3-4 letras com sinônimo curado (`PET`, `BAR`) não entra mais no set
  de matching como palavra crua — só o sinônimo específico é usado. E o stem automático (corte de
  sufixo) só roda quando **não** existe sinônimo curado pra aquela palavra — confiar no mapeamento
  manual é mais seguro que cortar 2 letras às cegas (era isso que gerava o `SEGUR` perigoso).
- Residual conhecido, não fixável por regra geral: `MEDIC` (médico/medicamento) ainda bate em
  "**medic**ação" — as duas palavras realmente começam iguais em português. Só ocorrência disso na
  base inteira (`8299701`, medição de consumo de energia); excluído pontualmente via
  `CNAES_EXCLUIDOS_POR_TERMO` em vez de criar um mecanismo genérico pra 1 caso.

**Fix curado (mesmo mecanismo da seção 26 — `CNAES_POR_TERMO`), pros 3 nichos cuja raiz de texto
é ampla demais mesmo com o fix estrutural:**
- `OFICINA`/`MECANICO`/`MECANICA` (+ plurais): removida a raiz `MANUTENC` de `SINONIMOS`
  (existia tanto em `SINONIMOS_VALIDADOS` quanto em `NOVOS_PENDENTE_VALIDACAO` — o processo de
  validação de 2026-07-13 só conferia se a raiz existia em algum CNAE, nunca se o resultado era
  específico). Substituída por 4 códigos de reparo automotivo/moto: `4520001`, `4520003`,
  `4520007`, `4543900`. "Oficina mecânica" foi de 52 → 4 CNAEs, todos corretos.
- `TRANSPORTADORA` (+ plural): removida a raiz `TRANSPORTE`. Substituída por 13 códigos de
  carga/frete (rodoviário, ferroviário, marítimo, fluvial, aéreo, agenciamento/logística de
  carga), excluindo passageiro, escolar, metrô e transporte espacial. 55 → 15 CNAEs (13 exatos +
  2 limítrofes defensáveis: revenda de combustível "por transportador retalhista", que ainda casa
  via stem da palavra crua "transportadora").
- `AUTOPECAS`: removida a raiz `PECAS E ACESSORIOS`. Substituída por 14 códigos de fabricação e
  comércio de peça de veículo/moto. 58 → 14 CNAEs, todos corretos.

**Validado**: rodei a mesma auditoria completa de novo pós-fix pras 72 (agora 68, 4 chaves movidas
pra `CNAES_POR_TERMO`) entradas do dicionário e conferi cada uma com mais de 6 resultados —
nenhuma colisão sem explicação restante além do `MEDIC`/medição já documentado e excluído. 8
testes novos em `test/receita-matching.test.js` travam os casos (`casaTermo` não casa no meio de
palavra; stem perigoso não é mais gerado; nichos curados retornam código). `npm run
validar-sinonimos` estendido pra também validar que os códigos de `CNAES_POR_TERMO` existem de
fato na tabela `cnaes`. Suíte inteira: **63/63 passando**. Gerei
`leads/leads_oficina_mecânica_são_paulo_sp_2026-08-17T23-27-17.xlsx` (20 leads) pra confirmar
visualmente — só oficina de carro/moto, nada de manutenção de elevador/aeronave/computador.

---

## 28. Domínio comprado e VPS contratada — história 7.1 validada contra infra real (2026-08-19 / 2026-08-25)

Fecha a pendência que a seção 25 chamou de "o gargalo mais barato e mais bloqueante do projeto".
O Épico 7 saiu do papel: a 7.1 é a primeira história do épico que passou de 🟡 pra ✅ de verdade,
rodada contra um servidor real e não só com `bash -n`.

**Domínio (2026-08-19):** `leadoor.com.br`. `deploy/Caddyfile` e `deploy/README.md` já não têm
mais o placeholder `seu-dominio.com.br` — está tudo com o domínio real, inclusive o
`APP_ORIGIN=https://leadoor.com.br` que o CORS da 4.1 exige.

**VPS (2026-08-25):** Hostinger KVM 2, região Brasil — `179.199.132.111`
(`srv1928301.hstgr.cloud`), ~11ms de latência medida daqui. A escolha da região brasileira foi
por latência: o servidor responde a busca e serve o `.xlsx` pro usuário final, então o RTT conta.

**7.1 — `deploy/setup-vps.sh` rodado no servidor real, item por item confirmado:** usuário
`deploy` criado, SSH só por chave (login de root remoto desabilitado — testado de verdade, não
assumido), UFW com 22/80/443, fail2ban ativo, `unattended-upgrades`, timezone
`America/Sao_Paulo`, swap de 2GB, Node v24.19.0 + pm2 7.0.4.

**Achado 1 — o fail2ban baniu o IP do próprio operador durante o teste.** Confirmar que o root
estava bloqueado significa tentar logar como root e falhar; várias tentativas seguidas é
exatamente a assinatura de força bruta que o fail2ban existe pra cortar. Resultado: o IP de casa
ficou banido e o SSH parou de responder por completo — inclusive pro usuário `deploy`, que estava
funcionando. Resolvido pelo **console do navegador do painel da Hostinger**, que é acesso
out-of-band e não passa pelo SSH nem pelo fail2ban. Lição pra próxima vez que alguém provisionar
um servidor: o console web do provedor é a escada de incêndio — saber onde ele fica *antes* de
mexer em SSH/firewall vale mais do que qualquer precaução no script.

**Achado 2 — lacuna real entre o script e o que o servidor precisou (ainda não corrigida no
script).** `setup-vps.sh` cria o `deploy` com `adduser --disabled-password` e o joga no grupo
`sudo`, mas **nunca escreve uma regra `NOPASSWD`**. Um usuário sem senha definida não tem como
responder ao prompt do `sudo` — ou seja, do jeito que o script termina, o `deploy` está no grupo
sudo mas não consegue usar sudo. No servidor real isso foi resolvido na mão com uma regra
`NOPASSWD` específica (não `ALL`), o que é seguro aqui porque o único caminho até esse usuário é
a chave SSH. **O script segue sem esse passo**: se rodar de novo num servidor limpo, o mesmo
ajuste manual vai ser necessário. Vale corrigir no `setup-vps.sh` antes que alguém provisione o
segundo servidor achando que o script cobre tudo.

**A confirmar antes da 7.2/7.6:** se o disco do plano contratado atende a recomendação de 60GB da
seção 24 — o `receita.db` sozinho tem ~10,7GB e a atualização mensal (7.6) precisa de ~35GB
livres durante a troca (banco atual + geração anterior + banco novo + ZIPs).

**Próximo passo:** apontar o DNS — registro `A` de `leadoor.com.br` → `179.199.132.111`. É o que
destrava três coisas de uma vez (verificação do domínio no Resend com SPF/DKIM, `APP_ORIGIN` de
produção, e o certificado automático do Caddy, que só emite depois do DNS propagar). Depois disso,
seguir a 7.2 (primeiro deploy manual + `rsync` do `receita.db`) na ordem do `deploy/README.md`.

---

## 29. DNS apontado, VPS conferida e caminho de transferência do `receita.db` redefinido (2026-08-29)

Sessão de continuação da seção 28. O passo que aquela seção deixou como "próximo" foi executado, e
a conferência da VPS por SSH respondeu a dúvida que tinha ficado em aberto.

**DNS apontado.** Registro `A` criado no painel do Registro.br: `leadoor.com.br` →
`179.199.132.111`. Foi pelo caminho **DNS → Configurar endereçamento** (modo simples), campo
"Endereço do site", que aceita IPv4 direto. Confirmado resolvendo em `b.auto.dns.br`
(autoritativo) e no `8.8.8.8`; o `a.auto.dns.br` ainda não tinha replicado no momento da
verificação. O domínio entrou em estado **"em transição"** (~2h anunciadas no painel), que é o
Registro.br sincronizando os dois autoritativos — durante ele o editor de zona mostra "Nenhum dado
encontrado" e recusa alterações. Não é erro; é só esperar.

**Achados do painel do Registro.br** (valem pra próxima vez que alguém mexer lá):
- O modo simples ("Configurar endereçamento") só cria o `A` do domínio raiz. **`www` e os TXT do
  Resend exigem o modo avançado** ("Configurar zona DNS"), que só libera depois da transição.
- O modo avançado **não aceita os caracteres `@` nem `*`**, e o nome do registro vai por extenso
  (`www.leadoor.com.br`, não `www`) — diferente da convenção da maioria dos painéis.
- Deixar o campo "Servidor de e-mail" vazio fez o painel criar um **MX nulo** (`MX 0 .`) no apex,
  que é a declaração formal de "este domínio não recebe e-mail". Está correto pro cenário atual (o
  Resend só *envia* em nome do domínio), mas **tem que ser removido** se um dia quiserem um
  `contato@leadoor.com.br` recebendo mensagem.

**Titularidade (via whois).** O domínio está no nome de **Giovanni Campos**
(`giovannicamposbiazioli@gmail.com`). No Registro.br o login é o CPF do titular e não existe acesso
compartilhado nem convite de equipe — qualquer alteração de DNS depende dele ou de acesso cedido
por ele. Data real de criação: **12/08/2026** (expira 12/08/2027); o `BACKLOG.md` dizia 19/08,
corrigido.

**VPS conferida por SSH — resolve a pendência da seção 28.** Disco de **96 GB com 93 GB livres**,
folgado pra recomendação de 60 GB da seção 24. 7,8 GB de RAM, Node v24.19.0, pm2 7.0.4, git 2.43.0.
Caddy ainda não instalado e repositório ainda não clonado — a 7.2 não tinha começado.

**Transferência do `receita.db` redefinida — o guia não funciona no Windows.** O
`deploy/README.md` manda usar `rsync`, mas **o Git Bash do Windows não tem `rsync`** (a VPS tem; o
problema é o lado do operador). Mesma família de lacuna do `NOPASSWD` da seção 28: o guia foi
escrito pressupondo Linux/Mac. Caminho adotado no lugar:

- Enviar `data/receita-db.zip` (**4,3 GB**, contém exatamente o `receita.db` de 11,19 GB) em vez do
  `.db` cru — **61% menos dados trafegados**.
- Usar `sftp` com o comando `reput`, que **retoma de onde parou** se a conexão cair. Era essa a
  propriedade que motivava o `rsync` no guia original, e o `sftp` a tem nativamente no OpenSSH que
  já vem no Git Bash.
- Descompactar no servidor — **exige instalar `unzip`**, que não vem na imagem da Hostinger.
- O link do Google Drive guardado como referência **foi descartado**: aponta pra uma geração antiga
  de 5,2 GB, e a base atual tem 11,19 GB.

**Achado de código — `app.listen` sem host (não corrigido ainda).** `src/server.js` faz
`app.listen(PORT, ...)` sem endereço, o que faz o Node escutar em **todas as interfaces de rede**, e
não só na interna. Na prática, assim que a aplicação subir, ela responde em `179.199.132.111:3000`
em HTTP puro, contornando o Caddy — hoje o único obstáculo é o UFW bloquear a porta. Pior: com
`app.set('trust proxy', 1)` (seção 24), quem alcançasse a 3000 diretamente poderia forjar o
cabeçalho `X-Forwarded-For` e se passar por qualquer IP, furando o rate limit das histórias 4.1/4.3.
Correção é trocar por `app.listen(PORT, '127.0.0.1', ...)` — o Caddy continua funcionando porque
fala de dentro da própria máquina, e a porta deixa de existir pro mundo mesmo se o firewall for
aberto por engano.

**Achado menor:** `.env.example` não lista `APP_ORIGIN`, apesar de o código usar a variável
(`src/middleware/seguranca.js`) e o `deploy/README.md` cobrar ela no `.env` de produção.

**Estado no fim da sessão:** DNS apontado e propagando; 7.2 pronta pra começar (não depende de DNS);
7.3 esperando a transição terminar pra emitir o certificado.

---

## 30. Épico 7 — história 7.2 executada de verdade: aplicação no ar na VPS (2026-08-29)

Segunda história do Épico 7 a sair de 🟡 pra ✅. A aplicação está rodando no servidor real, servindo
a interface e respondendo à API — falta só o Caddy (7.3) pra existir endereço público com HTTPS.

**Origem do código:** clonado de `https://github.com/kintekIT/lead-agent.git`, que é **público** —
a VPS baixou sem credencial nenhuma, o que simplifica o deploy e a 7.4 (CI/CD). O fork
`Levartosky/lead-agent` é privado e está desatualizado. Commit em produção: `6f02b92`.

**Dependências (`npm ci --omit=dev`):** o risco real aqui era o `better-sqlite3`, que tem parte em
C e precisa de binário compilado pro sistema de destino — se não houvesse prebuild pro Node 24 em
Linux x64, exigiria instalar toolchain de compilação na VPS. Resolveu sozinho; confirmado com
`require('better-sqlite3')` carregando sem erro. O npm 11 avisa que os install scripts do pacote não
estão cobertos por `allowScripts`, mas o binário nativo foi produzido mesmo assim.

**Transferência do banco — o caminho novo funcionou:** `data/receita-db.zip` (4.513.202.936 bytes)
enviado por `sftp put`, conferido byte a byte nas duas pontas, descompactado no servidor pra
11.193.733.120 bytes (idêntico ao original) e validado com consulta real: `empresas` 68.629.147
linhas, `estabelecimentos` 23.931.353, `municipios` 5.572, `cnaes` 1.359. Zip removido depois.
Disco final: 15GB usados de 96GB, **82GB livres** — folgado inclusive pros ~35GB que a atualização
mensal (7.6) consome durante a troca.

**Duas armadilhas do `sftp` descobertas na prática** (guia corrigido em `deploy/README.md`):
- `reput` **exige que já exista um arquivo parcial** no servidor — ele retoma, não inicia. Usado no
  primeiro envio, falha com `stat remote: No such file or directory`.
- `sftp -b` (modo batch) **sai com código 0 mesmo quando o comando interno falha**. O primeiro envio
  desta sessão "terminou com sucesso" sem ter transferido um byte. **Sempre conferir o tamanho do
  arquivo no destino**, nunca confiar no código de saída.

**`.env` de produção:** copiado por `scp` do `.env` local, `chmod 600`. **`APP_ORIGIN` não existia no
arquivo local** (nem está no `.env.example`, ver seção 29) — acrescentado como
`https://leadoor.com.br`. Confirmado ativo pelo header `access-control-allow-origin:
https://leadoor.com.br` nas respostas.

`ANTHROPIC_API_KEY` e `GEMINI_API_KEY` estão com placeholder, e **isso é aceitável**: `server.js`
recusa o modo `agente` com 400 e mensagem explícita mandando usar o modo RPA. Os dois motores que
importam (RPA e Receita Federal) não dependem de chave de IA. O único segredo real no arquivo é a
`SUPABASE_SERVICE_ROLE_KEY`.

**Processo sob pm2:** `pm2 start deploy/ecosystem.config.js` + `pm2 save` + `pm2 startup systemd`.
A unit `pm2-deploy` ficou `enabled` (sobe no boot); o `pm2 startup` precisou de sudo e passou pela
regra `NOPASSWD` da seção 28 sem pedir senha. **Ainda não testado com reboot de verdade** — enquanto
não há tráfego real, é um teste barato de fazer.

**Validação de ponta a ponta, por dentro do servidor:**
- `GET /health` → 200 `{"ok":true}` em 9ms
- `GET /` → 200, 35.914 bytes (interface completa)
- `GET /api/me` sem token → **401** (autenticação funcionando)
- headers de segurança do helmet presentes, `connect-src` do CSP com a URL do Supabase

**Exposição da porta 3000 — verificada, mas segue com uma camada só.** `curl` externo em
`http://179.199.132.111:3000/health` não obtém resposta: o UFW bloqueia. Mas o achado da seção 29
continua valendo e **agora é concreto**, porque a aplicação está de fato escutando em todas as
interfaces — o UFW é a única coisa entre a porta 3000 e a internet. A correção (`app.listen(PORT,
'127.0.0.1')`) segue pendente.

**Estado do Épico 7:** 7.1 ✅, 7.2 ✅, 7.3 esperando a transição do DNS terminar pra emitir o
certificado, 7.4/7.5/7.6 ainda 🟡.

---

*Última atualização: 2026-08-29 — história 7.2 concluída: aplicação rodando na VPS sob pm2, banco da
Receita transferido (zip de 4,3GB por `sftp`, validado byte a byte e por consulta real) e `.env` de
produção no lugar; validada por dentro (`/health` 200, `/api/me` 401, CORS com o domínio real).
Descobertas duas armadilhas do `sftp` (`reput` exige arquivo parcial; `-b` sai 0 mesmo falhando) e
corrigido o guia (seção 30). No mesmo dia: DNS apontado e domínio em transição no Registro.br, VPS
conferida (96GB de disco), e achado o `app.listen` sem host que deixa a porta 3000 protegida só pelo
UFW — ainda não corrigido (seção 29). Antes: domínio comprado e VPS contratada com a 7.1 validada
contra infra real, achados do fail2ban e do `NOPASSWD` (seção 28); auditoria do dicionário de
sinônimos CNAE com fix estrutural de word-boundary matching (seção 27) e o bug de nicho composto da
homologação com gestores (seção 26); custos e go-live no `BACKLOG.md` (seção 25); bug crítico de
`confirmar_compra` exposto ao `anon` corrigido em produção (seção 23); ver seções 13-30 pro
histórico recente.*
