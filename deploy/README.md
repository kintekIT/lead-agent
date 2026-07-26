# Deploy em produção — guia passo a passo (Épico 7)

Este diretório reúne os scripts e configs do Épico 7 (Infraestrutura & Deploy).
**Nada aqui foi testado contra um VPS real ainda** — os scripts foram escritos
e revisados (sintaxe validada), mas o backlog não tem um servidor contratado
neste momento. Siga este guia na ordem quando for provisionar de verdade, e
ajuste o que for necessário para a sua distro/provedor específico.

Pré-requisitos antes de começar: um VPS Ubuntu 22.04/24.04 LTS (mínimo
recomendado: 2 vCPU / 4GB RAM / 40GB disco — o `data/receita.db` sozinho
ocupa ~10,7GB) e, quando chegar na história 7.3, um domínio próprio com
acesso ao painel de DNS.

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
mesmas variáveis do `.env.example` na raiz, valores de produção (chaves reais do Supabase, `PIX_CHAVE`, `APP_ORIGIN=https://seu-dominio.com.br`, etc.).

**`data/receita.db`** (~10,7GB — não vai pelo git, está no `.gitignore`): transfira do seu
computador pro servidor com `rsync` (retomável, não recomeça do zero se cair a conexão):

```bash
# do seu computador (Windows: rode isso no Git Bash/WSL, rsync não existe no cmd/PowerShell)
rsync -avz --progress --partial data/receita.db deploy@SEU_IP:~/lead-agent/data/
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

<!-- 7.3, 7.4, 7.5, 7.6 são adicionados abaixo conforme cada história é implementada -->
