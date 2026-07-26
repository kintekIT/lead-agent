#!/usr/bin/env bash
# ============================================================================
# História 7.2 — Atualiza a aplicação já clonada no VPS pra última versão da
# main e reinicia via pm2. Roda como o usuário 'deploy' (nunca root), dentro
# da pasta do projeto:
#   cd ~/lead-agent && ./deploy/deploy.sh
#
# Também é o script que a história 7.4 (CI/CD) chama por SSH depois de um
# push pra main — mantém as duas formas de deploy (manual e automático)
# usando exatamente o mesmo caminho, pra nunca divergir.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # raiz do projeto (deploy/deploy.sh -> ..)

echo "==> git pull"
git fetch origin main
git reset --hard origin/main

echo "==> npm ci (só dependências de produção)"
npm ci --omit=dev

echo "==> Recarregando pm2 (0-downtime se já estiver rodando; senão, inicia)"
if pm2 describe lead-agent >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --update-env
else
  pm2 start deploy/ecosystem.config.js
  pm2 save
fi

echo "✅ Deploy concluído: $(git rev-parse --short HEAD) — $(node -p "require('./package.json').version")"
