// Logger estruturado (história 5.1) — JSON com timestamp, nível e o que mais
// for anexado (request-id, user_id, rota, status, latência via pino-http em
// server.js). Dados sensíveis nunca aparecem no log — ver `redact` abaixo.
const pino = require('pino');

// `destino` só é passado nos testes (captura a saída num stream em memória
// em vez de escrever no stdout de verdade) — em produção usa o padrão do pino.
function criarLogger(destino) {
  return pino({
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
  }, destino);
}

const logger = criarLogger();

module.exports = { logger, criarLogger };
