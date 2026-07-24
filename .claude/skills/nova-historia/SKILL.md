---
name: nova-historia
description: Implementa uma história do backlog do lead-agent seguindo o fluxo de branch-por-história do projeto (migration, código, testes, merge, docs). Use quando o pedido for "implementa a história X.Y" ou "continua o épico X" deste projeto.
arguments: numero nome
argument-hint: [numero-da-historia] [nome-curto-com-hifen]
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

## Contexto

Ver `BACKLOG.md` pro status de cada história (o que já está ✅/🟡/⬜) e `CONTEXTO.md` pro histórico de decisões e armadilhas conhecidas. Este projeto segue um fluxo fixo pra toda história nova — siga os passos na ordem, não pule etapas mesmo que pareçam óbvias.

## Passos

0. **Se `$numero` não existir no `BACKLOG.md`** (feature nova, fora dos 9 épicos originais): antes de tudo, adicione uma entrada pra ela lá — escolha um número que não colida (ex.: próximo da última história do épico mais próximo, ou um novo épico se não se encaixar em nenhum existente) e um status ⬜. O `BACKLOG.md` é a fonte de verdade de progresso mesmo pra coisas que não estavam no plano original; não pular esse cadastro só porque "não é do backlog oficial".
1. **Checar dependências**: no `BACKLOG.md`, confirme que as histórias das quais `$numero` depende já estão ✅. Se alguma não estiver, avise antes de prosseguir — não implemente em cima de uma base que não existe ainda.
2. **Checar se a branch já existe antes de criar uma nova** (o sócio costuma pré-criar branches pra reservar história — não assuma que não existe):
   ```
   git fetch kintekit --prune
   git branch -a | grep -i "$numero"
   ```
   - **Não achou nada** (nem local nem `kintekit/feature/...`): segue pro passo 2b.
   - **Achou uma branch vazia** (`git diff main...kintekit/feature/X --stat` não mostra nada): é só uma reserva de nome, sem trabalho de verdade — mas ela pode estar presa num commit antigo da `main` (essas branches costumam ser pré-criadas de uma vez só, faz tempo). Antes de codar, cheque `git log --oneline main..kintekit/feature/X | wc -l`: se der 0 (branch vazia é ancestral da main — o caso normal), dê `git checkout -b feature/$numero-$nome kintekit/feature/$numero-$nome` seguido de `git reset --hard main` (seguro: já confirmou que não há commit único nela pra perder) — assim o nome é reaproveitado mas o conteúdo já sai atualizado. Se der >0 (raro — branch vazia mas com commits próprios, tipo um merge commit sem diff), pare e avise em vez de resetar às cegas. Se o nome divergir do `$nome` pedido, avise o usuário em vez de criar uma segunda branch pra mesma história.
   - **Achou uma branch com trabalho de verdade**: depende de quem pediu a tarefa.
     - Se o **próprio usuário pediu explicitamente** pra continuar essa história/branch (ex.: "continua o épico 6.1", "continua de onde parei"): é o trabalho dele — `git checkout -b feature/$numero-$nome kintekit/feature/$numero-$nome` (ou `git checkout feature/$numero-$nome` se já existir local) e segue **desenvolvendo em cima dela normalmente**, sem parar pra pedir confirmação. Se ela estiver baseada numa `main` desatualizada, é só avisar isso de passagem (não precisa reconciliar/mergear agora, só quando o usuário pedir) e continuar codando por cima.
     - Se o agente **descobriu a branch sozinho** no meio de outra tarefa (o usuário não mencionou ela): **pare e avise antes de tocar em qualquer coisa** — pode ser o sócio trabalhando nela sem o usuário saber. Nunca mergear, sobrescrever ou abrir uma branch concorrente pra mesma história sem esse aviso primeiro. Reconciliação com a `main` (se a branch estiver desatualizada) é uma ação separada, só fazer quando pedido explicitamente — ver `CONTEXTO.md`, seção sobre a `release/kintek`, pro tipo de trabalho que isso costuma dar.
2b. **Criar a branch do zero** (só se não existir nenhuma): `git checkout main && git pull kintekit main`, depois `git checkout -b feature/$numero-$nome`.
3. **Migration** (se a história mexer com banco): escrever em `supabase/migrations/<timestamp>_<nome>.sql` seguindo as convenções do agente `lead-agent-dev` (advisory lock por usuário, `unnest(...) as alias(coluna)` sempre qualificado, `revoke`/`grant` restringindo a `service_role`). Atualizar a lista em ordem no `supabase/README.md`.
4. **Código**: implementar reaproveitando os padrões já existentes (config de domínio em `src/config/`, validação em `src/validation/schemas.js`, middleware em `src/middleware/`).
5. **Testes**: escrever/ajustar `test/*.test.js`; `node --test` tem que fechar 100% antes de seguir.
6. **Validar contra o banco real**: se a história envolver uma função Postgres nova, ela só existe depois que um humano colar a migration no SQL Editor do Supabase — **não afirme "pronto" sem isso**. Avise exatamente qual arquivo `.sql` precisa ser colado e em que ordem. Depois de aplicado, use a skill `validar-migration` pra confirmar de verdade.
7. **Commit + merge**: commit descritivo em português (o *porquê*, não só o *o quê*) → `git checkout main` → `git merge --no-ff feature/$numero-$nome` → `git push kintekit main` → `git push kintekit feature/$numero-$nome`. **Nunca** dar push em `origin`/Levartosky sem pedido explícito do usuário.
8. **Atualizar documentação viva**: marcar a história como concluída (✅) ou parcial (🟡, com o motivo) no `BACKLOG.md`; acrescentar uma entrada datada em `CONTEXTO.md` explicando o que mudou e por quê.
9. **Reportar ao usuário**: resumir o que foi feito, o que precisa de ação manual (migrations pendentes, variáveis de `.env`), e sugerir a próxima história fazendo sentido pela ordem de dependências do `BACKLOG.md` (a skill `nenas` com a ação `prioriza` faz esse ranking automaticamente, considerando também pendências transversais e o que já está desbloqueado).
