// Alertas de erro (história 5.3) — só ativa se SENTRY_DSN estiver no .env;
// sem isso, o app funciona normal, só sem captura de exceções externas.
// Conta free do Sentry já cobre o volume esperado deste projeto.
const Sentry = require('@sentry/node');

const SENTRY_DSN = process.env.SENTRY_DSN || '';

function iniciarSentry() {
  if (!SENTRY_DSN) return false;
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
  return true;
}

module.exports = { Sentry, iniciarSentry, sentryAtivo: () => Sentry.isInitialized() };
