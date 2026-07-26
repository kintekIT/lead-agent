#!/usr/bin/env bash
# ============================================================================
# História 7.6 — Baixa o dump mensal mais recente de CNPJ da Receita Federal,
# reimporta num banco NOVO (nunca mexe direto no receita.db em produção) e só
# troca o arquivo depois que a importação inteira terminar sem erro. Roda no
# VPS via cron, como o usuário 'deploy':
#   crontab -e
#   0 4 5 * * /home/deploy/lead-agent/deploy/atualizar-receita-mensal.sh >> /home/deploy/lead-agent/logs/atualizacao-receita.log 2>&1
#   (dia 5 do mês — a RFB normalmente só publica o dump do mês corrente a
#   partir dos primeiros dias; se ainda não tiver saído, o script cai pro
#   mês anterior sozinho)
#
# Por que reimportar num banco separado em vez de atualizar o receita.db que
# está em produção: o import demora dezenas de minutos pra ~24 milhões de
# linhas — fazer isso direto no arquivo que a aplicação está lendo ao vivo
# arriscaria consultas inconsistentes ou o arquivo corrompido a meio caminho.
# Importando à parte, se algo falhar (queda de internet, ZIP corrompido,
# disco cheio), a produção nem percebe — o script para antes de tocar no
# arquivo real.
#
# ⚠️ Espaço em disco: o script mantém 1 geração anterior do banco como
# válvula de escape (receita.db.anterior), então em regime já são uns ~22GB
# ocupados (banco atual + anterior). Durante a execução soma-se o banco
# novo sendo construído (~11GB) + os ZIPs baixados (alguns GB comprimidos)
# — reserve pelo menos ~35GB livres no disco antes de agendar isso.
# ============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="/home/deploy/receita-atualizacao-tmp"
BASE_URL="https://arquivos.receitafederal.gov.br/dados/cnpj/dados_abertos_cnpj"

ARQUIVOS=(Cnaes.zip Municipios.zip)
for i in $(seq 0 9); do ARQUIVOS+=("Empresas${i}.zip"); done
for i in $(seq 0 9); do ARQUIVOS+=("Estabelecimentos${i}.zip"); done

# ── Descobre o mês a baixar (o corrente, ou o anterior se ainda não saiu) ──
MES="${1:-$(date +%Y-%m)}"
if ! curl -fsSL -o /dev/null --head "$BASE_URL/$MES/Cnaes.zip"; then
  MES="$(date -d "$(date +%Y-%m-01) -1 month" +%Y-%m)"
  echo "[$(date -Iseconds)] Mês corrente ainda não publicado, usando $MES"
fi
echo "[$(date -Iseconds)] Atualizando base da Receita — mês $MES"

# ── Baixa os ZIPs pra uma pasta temporária limpa ──
rm -rf "$TMP_DIR"
mkdir -p "$TMP_DIR/zips"
cd "$TMP_DIR"

for arquivo in "${ARQUIVOS[@]}"; do
  echo "[$(date -Iseconds)] Baixando $arquivo"
  curl -fsSL -o "zips/$arquivo" "$BASE_URL/$MES/$arquivo"
done

# ── Reimporta num banco novo (fica em $TMP_DIR/data/receita.db — o script
#    de import deriva o caminho de process.cwd(), por isso o `cd` acima) ──
echo "[$(date -Iseconds)] Importando (isso demora — dezenas de minutos)"
node "$APP_DIR/src/scripts/importar-receita.js" "$TMP_DIR/zips"

# ── Consolida o WAL no arquivo principal antes de mover — sem isso, o mv
#    abaixo levaria só o .db e deixaria pra trás dado ainda não gravado
#    no arquivo principal (fica em receita.db-wal enquanto a conexão do
#    import não é fechada com checkpoint explícito) ──
node -e "
  const db = require('$APP_DIR/node_modules/better-sqlite3')('$TMP_DIR/data/receita.db');
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.close();
"

# ── Só agora toca no banco de produção — mv é atômico dentro do mesmo disco.
#    Mantém 1 geração pra trás (receita.db.anterior) como válvula de escape:
#    se a base nova vier ruim, reverter é `mv data/receita.db.anterior
#    data/receita.db && pm2 restart lead-agent`. Some só na atualização
#    seguinte, não logo depois de trocar. ──
echo "[$(date -Iseconds)] Import OK, trocando o banco de produção"
rm -f "$APP_DIR/data/receita.db.anterior"
mv "$APP_DIR/data/receita.db" "$APP_DIR/data/receita.db.anterior"
mv "$TMP_DIR/data/receita.db" "$APP_DIR/data/receita.db"

# ── Reinicia a app: o processo em memória mantém aberto o arquivo antigo
#    (por inode) até reiniciar, mesmo depois do mv trocar o que o nome
#    "receita.db" aponta ──
pm2 restart lead-agent

rm -rf "$TMP_DIR"
echo "[$(date -Iseconds)] ✅ Atualização mensal concluída (mês $MES)"
