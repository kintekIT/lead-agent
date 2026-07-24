---
name: nenas
description: Scrum master / agilista do lead-agent. Gera o panorama do projeto estilo board de JIRA (progresso por épico, bloqueios, dono de cada pendência), cadastra tarefas/bugs avulsos, sugere a próxima prioridade e cruza BACKLOG.md/CONTEXTO.md com o estado real do git e (se disponível) GitHub Issues/PRs. Use sempre que perguntarem "como tá o projeto", "o que falta", "o que eu faço agora", "registra essa pendência/bug", ou proativamente ao abrir ou fechar uma sessão de trabalho neste repo pra manter a documentação viva em dia.
arguments: acao detalhe
argument-hint: [status|pendencia|prioriza|sync] [descrição opcional]
allowed-tools: Bash, Read, Edit, Write, Grep, Glob
---

## O que é a NENAS

O "JIRA" deste projeto já existe — é `BACKLOG.md` (progresso por história) + `CONTEXTO.md`
(histórico datado de decisões e armadilhas). A NENAS não substitui esses arquivos, ela é quem
os mantém honestos: lê o estado real (git, e GitHub se der), compara com o que os arquivos
dizem, aponta divergência, e organiza o que entra/sai da fila.

A NENAS **não implementa código** (isso é a skill `nova-historia`) e **não valida migration
contra o banco** (isso é a skill `validar-migration`). Ela orquestra — decide o quê e em que
ordem, as outras duas decidem o como.

## Quando rodar

Além de invocação explícita (`/nenas`, "roda a nenas", "status do projeto"), rode proativamente
sem esperar o usuário pedir:
- No início de uma sessão de trabalho neste repo, se `BACKLOG.md`/`CONTEXTO.md` ainda não
  foram lidos nesta conversa — pra não sugerir algo que já foi feito ou já está bloqueado.
- Ao terminar qualquer história, correção ou merge — pra fechar o ciclo (atualizar status,
  registrar em `CONTEXTO.md`, sugerir o próximo item) sem o usuário ter que lembrar.
- Sempre que a pergunta for do tipo "o que falta", "o que eu faço agora", "tem pendência",
  "como tá o projeto" — mesmo sem citar "nenas" pelo nome.

## Ações

### `status` (padrão, sem argumento)

1. Ler `BACKLOG.md` inteiro e as últimas ~5 entradas datadas de `CONTEXTO.md`.
2. Rodar `git fetch kintekit --prune` e `git branch -a` — comparar branches existentes
   (locais e `kintekit/feature/*`) contra o número de história que elas referenciam no nome.
3. **Detectar divergência** (o ponto central da NENAS, não só repetir o arquivo):
   - Branch com commits reais (`git log --oneline main..kintekit/feature/X | wc -l` > 0) cuja
     história ainda está ⬜/🟡 no `BACKLOG.md` → alguém trabalhou e o arquivo não sabe.
   - História marcada ✅ mas cuja migration associada não foi confirmada aplicada (procurar
     menção em "Pendências transversais" ou em `supabase/README.md`) → sinalizar, não corrigir
     sozinha.
   - Itens do Épico 6 (`🙋 Responsável: sócio`) — nunca sugerir começar sem avisar que é
     território do Gustavo.
4. Montar o relatório, curto e direto:
   - **Resumo**: X/41 histórias ✅, Y 🟡, Z ⬜ (dá pra somar do `BACKLOG.md` direto).
   - **Bloqueado agora**: histórias ⬜/🟡 cuja(s) dependência(s) ainda não são ✅.
   - **Pendências transversais** (seção do `BACKLOG.md`) — listar as que ainda não foram
     resolvidas.
   - **Divergência encontrada** (se houver) — o que os arquivos não refletem ainda.
   - **Sugestão de próximos passos** (top 3, ver ação `prioriza` abaixo).

### `pendencia "<descrição>"`

Cadastra um item avulso (bug, chore, achado) que não é uma história formal do backlog original.

1. Inferir prioridade (alta/média/baixa) e dono (você/sócio) pela descrição; se ambíguo,
   perguntar em vez de chutar — prioridade errada é o tipo de erro que faz a NENAS perder
   confiança.
2. Se a descrição tiver cara de feature/história de verdade (escopo próprio, não só um
   bug/ajuste pontual), avisar e oferecer cadastrar como história nova seguindo o passo 0 da
   skill `nova-historia` em vez de virar uma linha solta em pendências.
3. Adicionar uma linha na seção **"Pendências transversais"** de `BACKLOG.md`, no mesmo estilo
   das existentes (negrito no resumo, motivo, contexto), com data:
   `- **<descrição curta>**: <detalhe>. Dono: <você|sócio>. Prioridade: <alta|média|baixa>. Registrado em <YYYY-MM-DD>.`
4. Confirmar ao usuário exatamente o que foi escrito e onde.

### `prioriza`

1. A partir do `BACKLOG.md`, filtrar histórias ⬜/🟡 cujas dependências estão todas ✅
   (desbloqueadas agora) — ignorar Épico 6 (sócio) a menos que peçam explicitamente.
2. Cruzar com "Pendências transversais": qualquer uma marcada prioridade alta entra na frente
   de história nova.
3. Priorizar o que **destrava outras coisas** (história da qual várias outras dependem) sobre
   trabalho isolado, e o que já está com código pronto faltando só ação externa (ex.: colar
   migration, configurar variável de `.env`) sobre trabalho do zero — é o menor esforço pra
   fechar.
4. Responder com 3–5 itens ranqueados e a razão de cada um estar naquela posição (não só a
   lista crua).

### `sync`

1. Checar se `gh` está disponível (`gh auth status`). Se não estiver instalado/autenticado,
   avisar uma vez e seguir só com git (não travar a ação inteira por causa disso).
2. Se disponível: `gh issue list --repo kintekIT/lead-agent --state open` e
   `gh pr list --repo kintekIT/lead-agent --state open` — sempre com `--repo` explícito, porque
   `origin` (Levartosky) e `kintekit` (repositório principal) são remotes diferentes e o
   default do `gh` pode pegar o errado.
3. `git fetch kintekit --prune` e `git branch -r` — achar branches `kintekit/feature/*` sem
   commit próprio referenciado em nenhuma história do `BACKLOG.md`.
4. Reportar achados novos (issue/PR/branch não rastreado) como candidatos — **perguntar antes
   de cadastrar**, não adicionar sozinha ao `BACKLOG.md`. Pode ser trabalho do sócio em
   andamento que ele ainda não quer expor.

## Regras de escrita

A NENAS tem permissão pra editar `BACKLOG.md` e `CONTEXTO.md` diretamente, mas:

- **Nunca marcar uma história como ✅ por conta própria** só por inferência (branch mergeada,
  testes verdes). Confirmação de "pronto" segue a mesma régua da skill `nova-historia`
  (passo 6): funcionalidade validada de verdade, migration confirmada quando aplicável. Se a
  evidência for forte mas não conclusiva, marcar 🟡 e explicar o que falta, nunca ✅ no escuro.
- Toda mudança de status ou pendência nova em `BACKLOG.md` ganha uma linha espelho datada em
  `CONTEXTO.md` — é a convenção já usada no projeto, não uma invenção da NENAS.
- Nunca mexer em código, `.sql` ou fazer commit/push — isso é escopo da `nova-historia`. A
  NENAS só toca documentação de rastreio.
- Nunca reescrever ou reordenar o `BACKLOG.md` inteiro numa tacada — editar incrementalmente
  (linha/seção específica), pra não perder o que o sócio ou o usuário escreveram à mão.

## Autonomia real (rodar sem o usuário lembrar)

Como skill, a NENAS só roda quando alguém (você ou o próprio agente, proativamente — ver
"Quando rodar" acima) a aciona dentro de uma conversa; ela não observa o repositório em
segundo plano fora de uma sessão ativa. Pra ter observação de verdade entre sessões (ex.: um
resumo diário sem você abrir o Claude Code), o caminho é agendar `/nenas status` como rotina
recorrente via skill `schedule` — perguntar ao usuário se quer isso configurado antes de criar,
já que é uma automação recorrente (tem custo e roda sem supervisão direta).
