// Hardening HTTP básico (história 4.1): headers de segurança, CORS restrito,
// e rate limit global por IP como primeira barreira contra abuso.

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// Em produção, definir APP_ORIGIN=https://seu-dominio.com no .env. Sem essa
// variável, assume o dev local (mesma origem do `npm run web`).
const APP_ORIGIN = process.env.APP_ORIGIN || 'http://localhost:3000';

const corsMiddleware = cors({
  origin: APP_ORIGIN,
  methods: ['GET', 'POST'],
});

// Primeira barreira: limite grosso por IP nas rotas de API. Limites mais
// finos por usuário autenticado ficam para a história 4.3 (depende de auth).
const limiteApi = rateLimit({
  windowMs: 60 * 1000,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Aguarde um minuto e tente novamente.' },
});

// Segunda barreira (história 4.3): limite por usuário autenticado, não por IP.
// Cobre o caso que o limite acima não cobre — um único usuário automatizando
// chamadas de IPs diferentes (proxy/VPN) ainda esbarra aqui, porque a chave é
// req.usuario.id em vez do IP. Aplicado só nas rotas caras (geram leads de
// verdade / batem no motor de busca), depois do middleware `autenticar`
// (precisa de req.usuario já preenchido).
const limitePorUsuario = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.usuario.id,
  message: { erro: 'Muitas buscas em pouco tempo nesta conta. Aguarde um minuto e tente novamente.' },
});

// O frontend (public/index.html) usa <script> inline e atributos onclick="".
// O CSP padrão do helmet bloqueia os dois (script-src 'self' sem
// 'unsafe-inline', script-src-attr 'none'), o que derruba silenciosamente
// todos os botões da interface. Libera só o necessário para o app atual
// funcionar, mantendo o resto do CSP padrão do helmet.
//
// connect-src também precisa liberar o domínio do Supabase: sem isso, ele
// herda de default-src 'self' e bloqueia toda chamada do supabase-js feita
// direto do navegador (login, refresh de sessão, logout) — só as chamadas
// para o nosso próprio backend (/api/*) são same-origin e não são afetadas.
const conectaSupabase = process.env.SUPABASE_URL ? [process.env.SUPABASE_URL] : [];

const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", "'unsafe-inline'"],
      'script-src-attr': ["'unsafe-inline'"],
      'connect-src': ["'self'", ...conectaSupabase],
    },
  },
});

module.exports = { helmetMiddleware, corsMiddleware, limiteApi, limitePorUsuario, APP_ORIGIN };
