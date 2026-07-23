// Logger estruturado (história 5.1) — JSON com timestamp, nível e o que mais
// for anexado (request-id, user_id, rota, status, latência via pino-http em
// server.js). Dados sensíveis nunca aparecem no log — ver `redact` abaixo.
//
// Rotação e retenção (história 5.2): além do stdout (pra continuar vendo os
// logs no terminal em dev, igual antes), escreve em arquivos que giram por
// dia ou por tamanho, mantendo só os últimos LOG_RETENCAO_DIAS. Como a
// rotação é diária, "manter os últimos N arquivos" (limit.count) equivale a
// "reter N dias" na prática.
const pino = require('pino');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const LOG_RETENCAO_DIAS = Number(process.env.LOG_RETENCAO_DIAS) || 30;

const OPCOES = {
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password', 'senha', 'token',
      '*.password', '*.senha', '*.token',
    ],
    censor: '[REDACTED]',
  },
};

// `destino` só é passado nos testes (captura a saída num stream em memória,
// síncrono, sem transport nem arquivo) — em produção usa stdout + rotação.
// Em NODE_ENV=test sem destino explícito, também cai no modo síncrono sem
// transport: o transport usa worker thread + escreve arquivo de verdade em
// disco, o que não deveria acontecer como efeito colateral de rodar
// `npm test` (ver CONTEXTO.md, história 5.2).
function criarLogger(destino) {
  if (destino || process.env.NODE_ENV === 'test') return pino(OPCOES, destino);

  const transport = pino.transport({
    targets: [
      { target: 'pino/file', level: OPCOES.level, options: { destination: 1 } }, // stdout, como antes da 5.2
      {
        target: 'pino-roll',
        level: OPCOES.level,
        options: {
          file: path.join(LOG_DIR, 'app'),
          frequency: 'daily',
          size: '10m',
          mkdir: true,
          limit: { count: LOG_RETENCAO_DIAS },
        },
      },
    ],
  });

  return pino(OPCOES, transport);
}

const logger = criarLogger();

module.exports = { logger, criarLogger, LOG_DIR, LOG_RETENCAO_DIAS };
