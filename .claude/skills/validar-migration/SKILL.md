---
name: validar-migration
description: Testa uma função/migration Postgres nova do lead-agent rodando de verdade contra o Supabase, sem precisar de senha de usuário. Use depois que uma migration nova (RPC/trigger) for aplicada no SQL Editor, antes de marcar a história como concluída no BACKLOG.md.
allowed-tools: Bash, Read
---

## Por quê

CSP, RLS e bugs de escopo em SQL não aparecem só de ler o código — o bug do `contar_novos` (`unnest(...) as coluna` sendo sombreado pela coluna de mesmo nome dentro da subquery correlacionada, ver `CONTEXTO.md` 2026-07-23) só apareceu rodando contra o banco real, depois de uma revisão de código que pareceu correta. Sempre validar assim antes de considerar uma história pronta.

## Como pegar um token de sessão real sem senha

```js
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const anon  = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

const email = 'kintekit@gmail.com'; // conta de teste existente
const { data } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
const { data: verif } = await anon.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: 'magiclink' });
console.log(verif.session.access_token); // usar em "Authorization: Bearer <token>"
```

## Checklist

1. **Função existe?** Chamar `supabaseAdmin.rpc('nome_da_funcao', {...args mínimos})` — erro "Could not find the function" significa que a migration ainda não foi aplicada; peça pro usuário colar no SQL Editor antes de continuar.
2. **Caso feliz com dados reais**: rodar o fluxo completo (ex.: uma busca de verdade via `/api/iniciar` + SSE), conferindo saldo antes/depois via `saldo_creditos`.
3. **Dedup/repetição**, se a função mexer com `delivered_leads`: rodar a mesma operação duas vezes e confirmar que a segunda não repete CNPJs que a primeira já entregou (chamar a função de leitura, ex. `contar_novos`, e a de escrita, ex. `entregar_leads`, com o mesmo pool e comparar).
4. **Concorrência**, se a função debitar créditos: dois `Promise.all` chamando a mesma função pro mesmo usuário ao mesmo tempo — o saldo final tem que bater com o esperado, nunca ficar negativo.
5. **Limpar os dados de teste** ao final — é o banco real do projeto, não um sandbox: apagar linhas de teste em `searches`, `delivered_leads`, `credit_ledger`, e restaurar o saldo se algo foi debitado/creditado de teste.
6. Só marcar ✅ no `BACKLOG.md` depois de passar pelos passos acima.
