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

1. **Checar dependências**: no `BACKLOG.md`, confirme que as histórias das quais `$numero` depende já estão ✅. Se alguma não estiver, avise antes de prosseguir — não implemente em cima de uma base que não existe ainda.
2. **Checar se a branch já existe antes de criar uma nova** (o sócio costuma pré-criar branches pra reservar história — não assuma que não existe):
   ```
   git fetch kintekit --prune
   git branch -a | grep -i "$numero"
   ```
   - **Não achou nada** (nem local nem `kintekit/feature/...`): segue pro passo 2b.
   - **Achou uma branch vazia** (`git diff main...kintekit/feature/X --stat` não mostra nada): é só uma reserva de nome — `git checkout -b feature/$numero-$nome kintekit/feature/$numero-$nome` (ou o nome exato que já existir, mesmo que diverja do `$nome` pedido — avise o usuário da diferença de nome em vez de criar uma segunda branch pra mesma história) e segue normal a partir daqui.
   - **Achou uma branch com trabalho de verdade**: **pare e avise o usuário antes de tocar em qualquer coisa.** Pode ser o sócio trabalhando ativamente (checar a data do último commit). Nunca sobrescrever ou abrir uma branch concorrente pra mesma história. Se a branch estiver baseada numa `main` desatualizada (compare `git merge-base main kintekit/feature/X` com o HEAD atual da main), sinalize que vai precisar do mesmo tipo de reconciliação manual já feito uma vez neste projeto (ver `CONTEXTO.md`, seção sobre a `release/kintek`) — não é um merge trivial.
2b. **Criar a branch do zero** (só se não existir nenhuma): `git checkout main && git pull kintekit main`, depois `git checkout -b feature/$numero-$nome`.
3. **Migration** (se a história mexer com banco): escrever em `supabase/migrations/<timestamp>_<nome>.sql` seguindo as convenções do agente `lead-agent-dev` (advisory lock por usuário, `unnest(...) as alias(coluna)` sempre qualificado, `revoke`/`grant` restringindo a `service_role`). Atualizar a lista em ordem no `supabase/README.md`.
4. **Código**: implementar reaproveitando os padrões já existentes (config de domínio em `src/config/`, validação em `src/validation/schemas.js`, middleware em `src/middleware/`).
5. **Testes**: escrever/ajustar `test/*.test.js`; `node --test` tem que fechar 100% antes de seguir.
6. **Validar contra o banco real**: se a história envolver uma função Postgres nova, ela só existe depois que um humano colar a migration no SQL Editor do Supabase — **não afirme "pronto" sem isso**. Avise exatamente qual arquivo `.sql` precisa ser colado e em que ordem. Depois de aplicado, use a skill `validar-migration` pra confirmar de verdade.
7. **Commit + merge**: commit descritivo em português (o *porquê*, não só o *o quê*) → `git checkout main` → `git merge --no-ff feature/$numero-$nome` → `git push kintekit main` → `git push kintekit feature/$numero-$nome`. **Nunca** dar push em `origin`/Levartosky sem pedido explícito do usuário.
8. **Atualizar documentação viva**: marcar a história como concluída (✅) ou parcial (🟡, com o motivo) no `BACKLOG.md`; acrescentar uma entrada datada em `CONTEXTO.md` explicando o que mudou e por quê.
9. **Reportar ao usuário**: resumir o que foi feito, o que precisa de ação manual (migrations pendentes, variáveis de `.env`), e sugerir a próxima história fazendo sentido pela ordem de dependências do `BACKLOG.md`.
