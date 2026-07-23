const test = require('node:test');
const assert = require('node:assert/strict');

test('iniciarSentry() não ativa nada sem SENTRY_DSN no .env', () => {
  delete require.cache[require.resolve('../src/utils/sentry')];
  const antigoDsn = process.env.SENTRY_DSN;
  delete process.env.SENTRY_DSN;

  const { iniciarSentry, sentryAtivo } = require('../src/utils/sentry');
  const ativou = iniciarSentry();

  assert.equal(ativou, false);
  assert.equal(sentryAtivo(), false);

  if (antigoDsn !== undefined) process.env.SENTRY_DSN = antigoDsn;
  delete require.cache[require.resolve('../src/utils/sentry')];
});

test('iniciarSentry() ativa quando SENTRY_DSN está configurada', () => {
  delete require.cache[require.resolve('../src/utils/sentry')];
  const antigoDsn = process.env.SENTRY_DSN;
  // DSN de formato válido (projeto/host fictícios) — só testa a ativação,
  // não faz uma chamada de rede de verdade nesse teste.
  process.env.SENTRY_DSN = 'https://exemplo@o0.ingest.sentry.io/0';

  const { iniciarSentry, sentryAtivo } = require('../src/utils/sentry');
  const ativou = iniciarSentry();

  assert.equal(ativou, true);
  assert.equal(sentryAtivo(), true);

  if (antigoDsn === undefined) delete process.env.SENTRY_DSN; else process.env.SENTRY_DSN = antigoDsn;
  delete require.cache[require.resolve('../src/utils/sentry')];
});
