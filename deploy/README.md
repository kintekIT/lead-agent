# Deploy em produção — guia passo a passo (Épico 7)

Este diretório reúne os scripts e configs do Épico 7 (Infraestrutura & Deploy).
**Nada aqui foi testado contra um VPS real ainda** — os scripts foram escritos
e revisados (sintaxe validada), mas o backlog não tem um servidor contratado
neste momento. Siga este guia na ordem quando for provisionar de verdade, e
ajuste o que for necessário para a sua distro/provedor específico.

Pré-requisitos antes de começar: um VPS Ubuntu 22.04/24.04 LTS (mínimo
recomendado: 2 vCPU / 4GB RAM / **60GB disco** — o `data/receita.db` sozinho
ocupa ~10,7GB, e a atualização mensal da história 7.6 precisa de ~35GB
livres durante a troca, contando a geração anterior mantida como
segurança) e, quando chegar na história 7.3, um domínio próprio com acesso
ao painel de DNS.

---

## 7.1 — Hardening do VPS

Script: [`setup-vps.sh`](setup-vps.sh). Roda **uma vez**, como root, num
servidor recém-criado.

```bash
# do seu computador, copie o script pro servidor:
scp deploy/setup-vps.sh root@SEU_IP:/root/

# conecte e rode:
ssh root@SEU_IP
bash /root/setup-vps.sh
```

O que ele faz:
- Cria o usuário `deploy` (sudo, sem senha de root) e copia sua chave SSH pra ele.
- Trava o SSH: sem login de root, sem senha (só chave pública).
- UFW liberando só 22 (ssh), 80 e 443.
- `fail2ban` contra força bruta no SSH.
- Atualizações automáticas de segurança (`unattended-upgrades`).
- Timezone `America/Sao_Paulo` + sincronização de horário (`chrony`).
- 2GB de swap (ajuda no `npm install` do `better-sqlite3` e no import da Receita, que são pesados de memória).
- Node.js LTS + `pm2` instalados globalmente.

⚠️ **Antes de fechar a sessão root**, abra um terminal novo e confirme que
`ssh deploy@SEU_IP` funciona — se a chave não foi copiada certo você fica
trancado pra fora (o script avisa isso no final, mas vale confirmar).

Depois disso, todo o resto do deploy roda como o usuário `deploy`, nunca como
root.

---

## 7.2 — Deploy da aplicação + upload do `receita.db`

Primeiro deploy (feito uma vez, como o usuário `deploy`, não root):

```bash
ssh deploy@SEU_IP

git clone https://github.com/kintekIT/lead-agent.git
cd lead-agent
npm ci --omit=dev
```

**`.env`**: nunca vai pelo git. Copie o conteúdo manualmente (SSH/SCP, nunca por canal público) —
mesmas variáveis do `.env.example` na raiz, valores de produção (chaves reais do Supabase, `PIX_CHAVE`, `APP_ORIGIN=https://app.leadoor.com.br`, etc.).

**`data/receita.db`** (11,2GB — não vai pelo git, está no `.gitignore`): transfira do seu
computador pro servidor. **Mande o zip, não o `.db` cru** — `data/receita-db.zip` tem 4,3GB e
contém exatamente o mesmo banco, ou seja, 61% menos dados trafegados.

**No Linux/Mac** (tem `rsync`, que é retomável):

```bash
rsync -avz --progress --partial data/receita-db.zip deploy@SEU_IP:~/lead-agent/data/
```

**No Windows**: `rsync` **não existe no Git Bash** (nem no cmd/PowerShell) — só via WSL. Sem WSL,
use `sftp`, que vem junto do OpenSSH do Git Bash e cujo comando `reput` retoma um envio
interrompido de onde parou (é a propriedade que motivava o `rsync` aqui):

```bash
sftp -i ~/.ssh/SUA_CHAVE deploy@SEU_IP
# dentro do sftp:
cd lead-agent/data
put data/receita-db.zip       # primeiro envio
bye
```

**Se a conexão cair no meio**, reconecte e use `reput` (não `put`) pra continuar de onde parou:

```bash
reput data/receita-db.zip
```

> ⚠️ `reput` **só funciona se já existir** um arquivo parcial no servidor — ele retoma, não inicia.
> Usá-lo no primeiro envio falha com `stat remote: No such file or directory`. E atenção: o `sftp`
> em modo batch (`-b`) **sai com código 0 mesmo quando o comando falha**, então confira o tamanho
> do arquivo no servidor em vez de confiar no código de saída.

Evite `scp` pra esse arquivo: ele não retoma, e uma queda no fim de 4,3GB recomeça do zero.

**Descompactar no servidor** — `unzip` não vem instalado na imagem padrão:

```bash
sudo apt install -y unzip
cd ~/lead-agent/data && unzip receita-db.zip && rm receita-db.zip
```

Depois disso, suba o processo com `pm2` usando [`ecosystem.config.js`](ecosystem.config.js):

```bash
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # siga a instrução impressa — registra o pm2 pra sobreviver a um reboot do VPS
```

**Atualizações seguintes** (depois que já está no ar): [`deploy.sh`](deploy.sh) faz `git pull` +
`npm ci` + `pm2 reload` (reload é zero-downtime — não derruba requisições em andamento):

```bash
cd ~/lead-agent && ./deploy/deploy.sh
```

Esse é o mesmo script que a história 7.4 (CI/CD) chama automaticamente depois de um push pra `main`.

---

## 7.3 — Domínio + Caddy + HTTPS

> **Mudança de arranjo em 2026-09-01:** o domínio raiz (`leadoor.com.br` e `www`) passou a servir
> uma **landing page hospedada fora daqui**, e a aplicação mudou pro subdomínio
> **`app.leadoor.com.br`**. Marketing na raiz, produto no subdomínio — arranjo padrão de SaaS.
> Subdomínio não custa nada: quem registra o domínio tem direito a todos eles.
>
> Três lugares precisam concordar sobre esse endereço, e esquecer um quebra de formas diferentes:
> o **Caddyfile** (senão não emite certificado), o **`APP_ORIGIN`** do `.env` (senão o CORS bloqueia
> o próprio frontend) e o **Site URL do Supabase** (senão o link do e-mail de confirmação leva o
> cliente pro lugar errado).


**Antes de tudo:** aponte o domínio pro IP do VPS — registro DNS tipo `A`,
`app.leadoor.com.br` → `SEU_IP` (no painel do seu provedor de domínio, ex.
registro.br). Espera propagar (pode levar de minutos a algumas horas) antes
de seguir, senão o Caddy não consegue emitir o certificado.

Instalar o Caddy (repositório oficial):

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Editar `/etc/caddy/Caddyfile` com o conteúdo de [`Caddyfile`](Caddyfile) (já vem com
`app.leadoor.com.br` configurado), depois:

```bash
sudo systemctl reload caddy
```

O Caddy emite e renova o certificado Let's Encrypt sozinho — não precisa `certbot`/cron.

**Não esqueça de atualizar o `.env`** no servidor com o domínio real, senão o CORS (história 4.1) bloqueia o próprio frontend:

```env
APP_ORIGIN=https://app.leadoor.com.br
```

e reiniciar (`pm2 reload deploy/ecosystem.config.js --update-env`).

> A aplicação já foi ajustada (`app.set('trust proxy', 1)` em `src/server.js`) pra reconhecer o
> Caddy como reverse proxy de confiança — sem isso, o rate limit por IP (história 4.1/4.3) veria
> todo mundo vindo do mesmo IP (o do próprio Caddy) e quebraria silenciosamente em produção.

Confirme com `curl -I https://app.leadoor.com.br/health` — deve responder `200` com certificado válido.

---

## 7.4 — CI/CD (deploy automático)

Workflow: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml). A cada push (ou PR)
pra `main`, roda `npm test`; se for push direto (não PR) e os testes passarem, conecta no VPS por
SSH e roda o mesmo [`deploy.sh`](deploy.sh) do deploy manual — só automatiza o que você já faria à mão.

**Gere uma chave SSH dedicada só pro CI** (nunca reaproveite sua chave pessoal):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ./deploy_key -N ""
```

No VPS, adicione a **chave pública** (`deploy_key.pub`) no `authorized_keys` do usuário `deploy`:

```bash
cat deploy_key.pub | ssh deploy@SEU_IP 'cat >> ~/.ssh/authorized_keys'
```

No GitHub, em **Settings → Secrets and variables → Actions**, cadastre 3 secrets:

| Secret | Valor |
|---|---|
| `DEPLOY_HOST` | IP ou domínio do VPS |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | conteúdo do arquivo `deploy_key` (a chave **privada**) |

Depois disso, apague `deploy_key`/`deploy_key.pub` do seu computador (só o GitHub precisa guardar a privada).

> ⚠️ Este workflow ainda **não rodou de verdade** — só existe validação de sintaxe local. A
> primeira execução real acontece no primeiro push pra `main` depois que os secrets forem
> cadastrados; acompanhe na aba **Actions** do GitHub.

---

## 7.5 — Backups e limpeza de arquivos

**Limpeza de disco** (arquivos gerados que crescem sem parar): [`limpeza-diaria.sh`](limpeza-diaria.sh)
apaga planilhas de `leads/` com mais de 30 dias e sobras de log do pm2 (`logs/pm2-*.log`) com mais
de 14 dias — os logs da própria aplicação já são rotacionados sozinhos pelo `pino-roll` (história
5.2, respeita `LOG_RETENCAO_DIAS`), isso aqui só cobre o que o pm2 escreve por fora disso. Agende via cron, como o usuário `deploy`:

```bash
crontab -e
# adicione a linha:
0 3 * * * /home/deploy/lead-agent/deploy/limpeza-diaria.sh >> /home/deploy/lead-agent/logs/limpeza.log 2>&1
```

**O que *não* precisa de backup:**
- `data/receita.db` — é regenerável a partir dos ZIPs públicos da RFB ([`atualizar-receita-mensal.sh`](atualizar-receita-mensal.sh), história 7.6). Fazer backup de ~11GB de dado público reimportável é desperdício de espaço/custo.

**O que *precisa* de backup e não tem automático hoje — banco Postgres/Supabase:** o projeto
KintekIT está no **plano Free**, que **não inclui backup automático diário nem Point-in-Time
Recovery** (isso só existe a partir do plano Pro). Enquanto for Free, a recomendação oficial do
próprio Supabase é exportar manualmente e guardar a cópia fora da plataforma:

```bash
# roda do seu computador (precisa do Supabase CLI: npm i -g supabase)
supabase db dump --db-url "postgresql://postgres:[SENHA]@db.bafsvszjpztbmbhmcwqk.supabase.co:5432/postgres" -f backup-$(date +%F).sql
```

Isso guarda `profiles`, `credit_ledger`, `purchases`, `searches`, `delivered_leads`, `events` —
ou seja, todo o histórico de créditos e compras dos usuários reais. **Não existe automação pra
isso ainda** (não dá pra colocar a senha do banco num cron sem pensar em onde guardá-la com
segurança) — por ora é um passo manual periódico, ou decidir fazer upgrade pro plano Pro quando
o volume de usuários reais justificar.

---

## 7.6 — Atualização mensal da base da Receita

[`atualizar-receita-mensal.sh`](atualizar-receita-mensal.sh) baixa o dump do mês corrente da RFB,
reimporta num banco **separado** (nunca mexe no `receita.db` que a aplicação está lendo ao vivo) e
só troca o arquivo depois que a importação inteira terminar sem erro — se algo falhar no meio
(internet caiu, disco cheio, ZIP corrompido), a produção nem percebe. Mantém 1 geração anterior
(`receita.db.anterior`) como válvula de escape.

```bash
crontab -e
# dia 5 do mês, 4h da manhã — dá folga pra RFB publicar o dump do mês corrente
0 4 5 * * /home/deploy/lead-agent/deploy/atualizar-receita-mensal.sh >> /home/deploy/lead-agent/logs/atualizacao-receita.log 2>&1
```

Reverter se a base nova vier ruim:
```bash
cd ~/lead-agent
mv data/receita.db.anterior data/receita.db
pm2 restart lead-agent
```

> ⚠️ **Não consegui confirmar ao vivo a URL/estrutura de pastas da RFB** —
> `arquivos.receitafederal.gov.br` bloqueia requisições automatizadas
> (WebFetch bateu 404 tanto na raiz quanto numa pasta de mês específico,
> mesmo com a URL aparecendo indexada numa busca). O padrão usado no script
> (`.../dados_abertos_cnpj/AAAA-MM/Cnaes.zip` etc., mesmos 22 nomes de
> arquivo que `importar-receita.js` já espera) é o documentado/usado por
> outros projetos que consomem essa base, mas **faça um dry-run manual
> (`bash deploy/atualizar-receita-mensal.sh`, acompanhando o output) antes
> de confiar nisso rodando sozinho via cron** — se a RFB tiver mudado algo
> na estrutura de pastas, é aqui que vai quebrar.

---

## Resumo do que falta pra cada história virar ✅ de verdade

Todo o Épico 7 está com código/scripts prontos, mas **nada foi validado contra infraestrutura
real** — não existia VPS/domínio contratado no momento em que isso foi escrito. Quando contratar:

1. Rodar 7.1 num servidor de verdade e confirmar que o SSH com o usuário `deploy` funciona.
2. Fazer o primeiro deploy manual (7.2) — é o teste que valida se `deploy.sh`/`ecosystem.config.js` estão certos.
3. Apontar o domínio e confirmar HTTPS de verdade (7.3) — inclusive testar que o rate limit por IP não quebrou (o `trust proxy` é a parte mais fácil de errar aqui).
4. Cadastrar os secrets do GitHub e ver o primeiro deploy automático rodar do zero (7.4).
5. Rodar a limpeza e a atualização mensal manualmente uma vez cada (7.5/7.6) antes de confiar no cron — principalmente o 7.6, pela ressalva acima sobre a URL da RFB não verificada ao vivo.
