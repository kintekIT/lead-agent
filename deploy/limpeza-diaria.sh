#!/usr/bin/env bash
# ============================================================================
# História 7.5 — Limpeza diária de arquivos gerados. Roda no VPS via cron,
# como o usuário 'deploy':
#   crontab -e
#   0 3 * * * /home/deploy/lead-agent/deploy/limpeza-diaria.sh >> /home/deploy/lead-agent/logs/limpeza.log 2>&1
#
# Só apaga o que é regenerável / não é a fonte de verdade de nada:
#   - leads/*.xlsx  — planilhas já entregues ao usuário (o registro real da
#     busca/entrega vive no Postgres: searches, delivered_leads, credit_ledger).
#     O botão "Baixar de novo" (história 3.2) só funciona enquanto o arquivo
#     existir em disco — reter alguns dias dá tempo do usuário rebaixar.
#   - logs/*.log velhos — o pino-roll (história 5.2) já rotaciona e respeita
#     LOG_RETENCAO_DIAS sozinho; isso aqui é só um cinto-de-segurança pra
#     nomes de arquivo fora do padrão do pino-roll (ex. pm2-out.log/pm2-error.log,
#     que o pm2 não rotaciona por si só).
#
# NÃO mexe em data/receita.db (não é backup, é regenerável a partir dos ZIPs
# da RFB — ver deploy/atualizar-receita-mensal.sh) nem no banco Postgres
# (gerenciado pelo Supabase; ver nota sobre backup do Postgres no fim deste
# arquivo/no deploy/README.md).
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."   # raiz do projeto

RETENCAO_LEADS_DIAS=30
RETENCAO_PM2_LOGS_DIAS=14

echo "[$(date -Iseconds)] Limpando leads/ com mais de ${RETENCAO_LEADS_DIAS} dias"
find leads/ -maxdepth 1 -type f -name '*.xlsx' -mtime "+${RETENCAO_LEADS_DIAS}" -print -delete 2>/dev/null || true

echo "[$(date -Iseconds)] Limpando logs/pm2-*.log com mais de ${RETENCAO_PM2_LOGS_DIAS} dias"
find logs/ -maxdepth 1 -type f -name 'pm2-*.log' -mtime "+${RETENCAO_PM2_LOGS_DIAS}" -print -delete 2>/dev/null || true

echo "[$(date -Iseconds)] Limpeza concluída"
