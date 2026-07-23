const test = require('node:test');
const assert = require('node:assert/strict');
const { Writable } = require('node:stream');
const { criarLogger } = require('../src/utils/logger');

function loggerDeTeste() {
  let saida = '';
  const destino = new Writable({
    write(chunk, _enc, cb) { saida += chunk.toString(); cb(); },
  });
  const logger = criarLogger(destino);
  return { logger, linhas: () => saida.trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) };
}

test('logger emite JSON estruturado com nível e timestamp', () => {
  const { logger, linhas } = loggerDeTeste();
  logger.info({ rota: '/api/me' }, 'requisição concluída');

  const [linha] = linhas();
  assert.equal(linha.msg, 'requisição concluída');
  assert.equal(linha.rota, '/api/me');
  assert.equal(linha.level, 30); // pino: info = 30
  assert.ok(linha.time);
});

test('redige password/senha/token em qualquer nível do objeto', () => {
  const { logger, linhas } = loggerDeTeste();
  logger.info({ password: 'segredo123', dados: { senha: 'outroSegredo', token: 'abc' } }, 'cadastro');

  const [linha] = linhas();
  assert.equal(linha.password, '[REDACTED]');
  assert.equal(linha.dados.senha, '[REDACTED]');
  assert.equal(linha.dados.token, '[REDACTED]');
});

test('redige o header Authorization (nunca loga o Bearer token de sessão)', () => {
  const { logger, linhas } = loggerDeTeste();
  logger.info({ req: { headers: { authorization: 'Bearer eyJ...token-real' } } }, 'requisição');

  const [linha] = linhas();
  assert.equal(linha.req.headers.authorization, '[REDACTED]');
});

test('logger.error registra stack trace de um erro', () => {
  const { logger, linhas } = loggerDeTeste();
  const erro = new Error('falha simulada');
  logger.error({ err: erro }, 'erro não tratado');

  const [linha] = linhas();
  assert.equal(linha.level, 50); // pino: error = 50
  assert.ok(linha.err.stack.includes('falha simulada'));
});
