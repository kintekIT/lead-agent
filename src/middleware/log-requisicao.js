// Log estruturado de toda requisição (história 5.1): request-id, user_id
// (quando autenticado), rota, status e latência — um objeto JSON por
// requisição, via pino-http. Montado antes de tudo (helmet/cors/rotas) pra
// capturar mesmo requisições bloqueadas pelo rate limit ou pela auth; o
// "customProps" só é lido quando a resposta termina, então já vê req.usuario
// preenchido pelo middleware de auth se a requisição passou por ele.
const pinoHttp = require('pino-http');
const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

const logRequisicao = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const id = req.headers['x-request-id'] || randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  customProps: (req) => ({
    userId: req.usuario?.id ?? null,
    rota: req.route?.path ?? req.originalUrl,
  }),
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.originalUrl} -> ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${req.originalUrl} -> ${res.statusCode} (${err?.message})`,
});

module.exports = { logRequisicao };
