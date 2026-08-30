// Testes da integração com o Mercado Pago (história 2.7).
//
// O foco é a validação de assinatura do webhook e a conversão de valor: são
// as duas partes onde um erro não aparece em teste manual feliz, mas custa
// dinheiro em produção — assinatura frouxa deixa qualquer um creditar saldo,
// e arredondamento errado faz compra legítima ser recusada por "valor
// divergente".

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const SEGREDO = 'segredo-de-teste';

// O módulo lê o .env no require, então as variáveis têm que existir antes.
process.env.MERCADOPAGO_WEBHOOK_SECRET = SEGREDO;
process.env.MERCADOPAGO_ACCESS_TOKEN = 'token-de-teste';

const mercadopago = require('../src/pagamentos/mercadopago');

function assinar({ dataId, requestId, ts, segredo = SEGREDO }) {
  const manifesto = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  return crypto.createHmac('sha256', segredo).update(manifesto).digest('hex');
}

test('validarAssinatura aceita uma assinatura legítima', () => {
  const dataId = '123456789';
  const requestId = 'req-abc';
  const ts = '1704908010';
  const v1 = assinar({ dataId, requestId, ts });

  const ok = mercadopago.validarAssinatura({
    dataId,
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: requestId,
  });
  assert.equal(ok, true);
});

test('validarAssinatura recusa assinatura de outro segredo', () => {
  const dataId = '123456789';
  const requestId = 'req-abc';
  const ts = '1704908010';
  const v1 = assinar({ dataId, requestId, ts, segredo: 'segredo-do-atacante' });

  const ok = mercadopago.validarAssinatura({
    dataId,
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: requestId,
  });
  assert.equal(ok, false);
});

test('validarAssinatura recusa quando o id do pagamento foi trocado', () => {
  // Cenário real de ataque: interceptar uma notificação legítima e trocar só
  // o id, pra confirmar outra compra com uma assinatura válida.
  const requestId = 'req-abc';
  const ts = '1704908010';
  const v1 = assinar({ dataId: '111', requestId, ts });

  const ok = mercadopago.validarAssinatura({
    dataId: '222',
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: requestId,
  });
  assert.equal(ok, false);
});

test('validarAssinatura recusa header ausente ou malformado', () => {
  assert.equal(mercadopago.validarAssinatura({ dataId: '1', xSignature: undefined, xRequestId: 'r' }), false);
  assert.equal(mercadopago.validarAssinatura({ dataId: '1', xSignature: 'lixo', xRequestId: 'r' }), false);
  assert.equal(mercadopago.validarAssinatura({ dataId: '1', xSignature: 'ts=1', xRequestId: 'r' }), false);
  assert.equal(mercadopago.validarAssinatura({ dataId: undefined, xSignature: 'ts=1,v1=abc', xRequestId: 'r' }), false);
});

test('validarAssinatura normaliza o id para minúsculas, como o Mercado Pago faz', () => {
  const requestId = 'req-abc';
  const ts = '1704908010';
  const v1 = assinar({ dataId: 'ABC123', requestId, ts }); // assinar() já minusculiza

  const ok = mercadopago.validarAssinatura({
    dataId: 'ABC123',
    xSignature: `ts=${ts},v1=${v1}`,
    xRequestId: requestId,
  });
  assert.equal(ok, true);
});

test('consultarPagamento converte reais para centavos sem erro de ponto flutuante', async (t) => {
  // 99.9 * 100 dá 9989.999999999998 em JavaScript. Sem arredondar, a compra
  // legítima seria recusada pela conferência de valor da RPC.
  const original = global.fetch;
  t.after(() => { global.fetch = original; });

  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      id: 987654321,
      status: 'approved',
      external_reference: 'a3f1c0de-0000-4000-8000-000000000000',
      transaction_amount: 99.9,
    }),
  });

  const p = await mercadopago.consultarPagamento('987654321');
  assert.equal(p.valorCentavos, 9990);
  assert.equal(p.id, '987654321');           // string, pra bater com a coluna text
  assert.equal(p.status, 'approved');
  assert.equal(p.compraId, 'a3f1c0de-0000-4000-8000-000000000000');
});

test('consultarPagamento devolve valorCentavos nulo quando o MP omite o valor', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });

  global.fetch = async () => ({
    ok: true,
    json: async () => ({ id: 1, status: 'pending', external_reference: null }),
  });

  const p = await mercadopago.consultarPagamento('1');
  assert.equal(p.valorCentavos, null);
  assert.equal(p.compraId, null);
});

test('erro da API do Mercado Pago vira Error com status, em vez de passar batido', async (t) => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });

  global.fetch = async () => ({
    ok: false,
    status: 404,
    json: async () => ({ message: 'Payment not found' }),
  });

  await assert.rejects(
    () => mercadopago.consultarPagamento('inexistente'),
    (err) => err.status === 404 && /Payment not found/.test(err.message),
  );
});
