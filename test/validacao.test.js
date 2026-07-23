const test = require('node:test');
const assert = require('node:assert/strict');
const {
  iniciarBodySchema, previaBodySchema, sessionIdParamSchema,
  adminListQuerySchema, adminUsuarioIdParamSchema, adminPapelBodySchema,
} = require('../src/validation/schemas');
const { validar } = require('../src/middleware/validar');

test('iniciarBodySchema aceita um corpo válido e coage quantidade para número', () => {
  const r = iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'Sao Paulo SP', quantidade: '50', modo: 'receita' });
  assert.equal(r.success, true);
  assert.equal(r.data.quantidade, 50);
  assert.equal(typeof r.data.quantidade, 'number');
});

test('iniciarBodySchema usa "agente" como modo padrão quando omitido', () => {
  const r = iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'Sao Paulo SP', quantidade: 10 });
  assert.equal(r.success, true);
  assert.equal(r.data.modo, 'agente');
});

test('iniciarBodySchema rejeita nicho vazio ou muito curto', () => {
  const r = iniciarBodySchema.safeParse({ nicho: 'a', regiao: 'Sao Paulo SP', quantidade: 10 });
  assert.equal(r.success, false);
});

test('iniciarBodySchema rejeita quantidade fora do intervalo 1-1000', () => {
  assert.equal(iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 0 }).success, false);
  assert.equal(iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 1001 }).success, false);
  assert.equal(iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 'abc' }).success, false);
});

test('iniciarBodySchema rejeita modo desconhecido', () => {
  const r = iniciarBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 10, modo: 'hackeado' });
  assert.equal(r.success, false);
});

test('previaBodySchema aceita corpo válido sem o campo modo', () => {
  const r = previaBodySchema.safeParse({ nicho: 'dentista', regiao: 'Sao Paulo SP', quantidade: '20' });
  assert.equal(r.success, true);
  assert.equal(r.data.quantidade, 20);
});

test('previaBodySchema rejeita quantidade fora do intervalo 1-1000', () => {
  assert.equal(previaBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 0 }).success, false);
  assert.equal(previaBodySchema.safeParse({ nicho: 'dentista', regiao: 'SP', quantidade: 1001 }).success, false);
});

test('sessionIdParamSchema aceita o formato gerado pelo servidor', () => {
  assert.equal(sessionIdParamSchema.safeParse({ id: 's_1234567890_ab3xz' }).success, true);
});

test('sessionIdParamSchema rejeita formatos estranhos (ex.: tentativa de path traversal)', () => {
  assert.equal(sessionIdParamSchema.safeParse({ id: '../../etc/passwd' }).success, false);
  assert.equal(sessionIdParamSchema.safeParse({ id: '' }).success, false);
});

test('middleware validar() chama next() e substitui req.body em caso de sucesso', () => {
  const req = { body: { nicho: 'dentista', regiao: 'Sao Paulo SP', quantidade: '10' } };
  let chamouNext = false;
  const res = { status() { return this; }, json() {} };

  validar(iniciarBodySchema, 'body')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, true);
  assert.equal(req.body.quantidade, 10);
});

test('adminListQuerySchema aceita busca opcional e coage página para número, com padrão 1', () => {
  const r1 = adminListQuerySchema.safeParse({});
  assert.equal(r1.success, true);
  assert.equal(r1.data.pagina, 1);

  const r2 = adminListQuerySchema.safeParse({ busca: 'fulano@exemplo.com', pagina: '3' });
  assert.equal(r2.success, true);
  assert.equal(r2.data.pagina, 3);
  assert.equal(typeof r2.data.pagina, 'number');
});

test('adminListQuerySchema rejeita página menor que 1', () => {
  assert.equal(adminListQuerySchema.safeParse({ pagina: 0 }).success, false);
});

test('adminUsuarioIdParamSchema exige um uuid válido', () => {
  assert.equal(adminUsuarioIdParamSchema.safeParse({ id: '123e4567-e89b-12d3-a456-426614174000' }).success, true);
  assert.equal(adminUsuarioIdParamSchema.safeParse({ id: '../../etc/passwd' }).success, false);
  assert.equal(adminUsuarioIdParamSchema.safeParse({ id: '' }).success, false);
});

test('adminPapelBodySchema só aceita user ou admin', () => {
  assert.equal(adminPapelBodySchema.safeParse({ role: 'admin' }).success, true);
  assert.equal(adminPapelBodySchema.safeParse({ role: 'user' }).success, true);
  assert.equal(adminPapelBodySchema.safeParse({ role: 'superadmin' }).success, false);
});

test('middleware validar() com fonte "query" substitui req.query mesmo sendo um getter só-leitura (Express 5)', () => {
  // Reproduz o formato real do Express 5: req.query é definido via
  // Object.defineProperty com getter, sem setter, direto na instância.
  const req = {};
  Object.defineProperty(req, 'query', { configurable: true, enumerable: true, get: () => ({ pagina: '2' }) });

  let chamouNext = false;
  const res = { status() { return this; }, json() {} };

  validar(adminListQuerySchema, 'query')(req, res, () => { chamouNext = true; });

  assert.equal(chamouNext, true);
  assert.equal(req.query.pagina, 2);
  assert.equal(typeof req.query.pagina, 'number');
});

test('middleware validar() responde 400 com detalhes por campo em caso de erro', () => {
  const req = { body: { nicho: 'a', regiao: '', quantidade: -5 } };
  let statusCode = null;
  let corpo = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(payload) { corpo = payload; },
  };

  validar(iniciarBodySchema, 'body')(req, res, () => assert.fail('next() não deveria ser chamado'));

  assert.equal(statusCode, 400);
  assert.ok(Array.isArray(corpo.detalhes));
  assert.ok(corpo.detalhes.length > 0);
});
