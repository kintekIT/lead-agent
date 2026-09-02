#!/usr/bin/env bash
# ============================================================================
# Histórica 7.1 — Hardening inicial de um VPS Ubuntu (22.04/24.04 LTS) novo.
#
# Uso: copiar pro VPS e rodar como root, uma vez só, logo depois de contratar
# o servidor:
#   scp deploy/setup-vps.sh root@SEU_IP:/root/
#   ssh root@SEU_IP 'bash /root/setup-vps.sh'
#
# O que faz: cria um usuário sudo sem senha de root, tranca SSH (só chave,
# sem root remoto), UFW (só 22/80/443), fail2ban, atualizações automáticas
# de segurança, timezone, swap (se a VPS tiver pouca RAM) e instala
# Node.js LTS + pm2 (runtime da aplicação). NÃO instala o Caddy nem clona o
# repo — isso é a história 7.2/7.3, depois que este script rodar.
#
# Idempotente na medida do possível — pode rodar de novo sem duplicar nada,
# mas foi pensado pra rodar uma vez num servidor limpo.
# ============================================================================
set -euo pipefail

DEPLOY_USER="deploy"
SWAP_SIZE_MB=2048

if [ "$(id -u)" -ne 0 ]; then
  echo "Rode como root (ou via sudo)." >&2
  exit 1
fi

echo "==> Atualizando pacotes do sistema"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

echo "==> Criando usuário '$DEPLOY_USER' (sudo, sem senha de root)"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" "$DEPLOY_USER"
  usermod -aG sudo "$DEPLOY_USER"
  mkdir -p "/home/$DEPLOY_USER/.ssh"
  if [ -f /root/.ssh/authorized_keys ]; then
    cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/authorized_keys"
  else
    echo "⚠️  /root/.ssh/authorized_keys não existe — copie sua chave pública" \
         "pra /home/$DEPLOY_USER/.ssh/authorized_keys manualmente antes de" \
         "desligar o login por senha, senão você fica trancado pra fora."
  fi
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
  chmod 700 "/home/$DEPLOY_USER/.ssh"
  chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys" 2>/dev/null || true
else
  echo "    usuário '$DEPLOY_USER' já existe, pulando criação"
fi

echo "==> Hardening do SSH (sem login de root, sem senha — só chave)"
SSHD_CONFIG=/etc/ssh/sshd_config
cp -n "$SSHD_CONFIG" "$SSHD_CONFIG.bak-original" || true
sed -i \
  -e 's/^#\?PermitRootLogin.*/PermitRootLogin no/' \
  -e 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' \
  -e 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' \
  "$SSHD_CONFIG"
systemctl reload sshd || systemctl reload ssh

echo "==> Firewall (UFW): só 22 (ssh), 80 e 443 liberados"
apt-get install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "==> fail2ban (bloqueia IP após tentativas de força bruta no SSH)"
apt-get install -y fail2ban
systemctl enable --now fail2ban

echo "==> Atualizações automáticas de segurança"
apt-get install -y unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Timezone e sincronização de horário"
timedatectl set-timezone America/Sao_Paulo
apt-get install -y chrony
systemctl enable --now chrony

echo "==> Swap de ${SWAP_SIZE_MB}MB (ajuda em builds/imports pesados, ex. better-sqlite3 e o import da Receita)"
if [ ! -f /swapfile ]; then
  fallocate -l "${SWAP_SIZE_MB}M" /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
else
  echo "    /swapfile já existe, pulando"
fi

echo "==> Instalando Node.js LTS (via NodeSource) + pm2"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo ""
echo "✅ VPS hardenizada. Próximos passos (história 7.2):"
echo "   1. Testar login com o usuário novo NUMA JANELA SEPARADA antes de fechar"
echo "      esta sessão root: ssh $DEPLOY_USER@\$(curl -s ifconfig.me)"
echo "   2. Se logar certo, seguir deploy/README.md pra clonar o repo e subir a app."
