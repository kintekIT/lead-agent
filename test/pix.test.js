const test = require('node:test');
const assert = require('node:assert/strict');
const { gerarPayloadPix } = require('../src/utils/pix');

// Reimplementa o parser TLV (independente da geração) só para o teste
// conseguir validar a própria saída sem depender de nenhum valor mágico
// externo — se o encoder e este decoder concordam, a estrutura está correta.
function parsearTLV(payload) {
  const campos = {};
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const tamanho = parseInt(payload.slice(i + 2, i + 4), 10);
    const valor = payload.slice(i + 4, i + 4 + tamanho);
    campos[id] = valor;
    i += 4 + tamanho;
  }
  return campos;
}

function crc16ReferenciaIndependente(str) {
  let crc = 0xFFFF;
  for (const ch of str) {
    crc ^= ch.charCodeAt(0) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

test('gerarPayloadPix produz uma estrutura TLV bem formada e com o mesmo tamanho declarado em cada campo', () => {
  const payload = gerarPayloadPix({ chave: 'financeiro@kintekit.com.br', valor: 199, nome: 'KintekIT Ltda', cidade: 'Sao Paulo', txid: 'abc-123-def' });

  assert.equal(typeof payload, 'string');
  assert.ok(payload.length > 40);

  const campos = parsearTLV(payload);
  assert.equal(campos['00'], '01');
  assert.equal(campos['53'], '986');
  assert.equal(campos['58'], 'BR');
  assert.equal(campos['54'], '199.00');
  assert.equal(campos['63'].length, 4);

  const contaPix = parsearTLV(campos['26']);
  assert.equal(contaPix['00'], 'br.gov.bcb.pix');
  assert.equal(contaPix['01'], 'financeiro@kintekit.com.br');
});

test('CRC do payload bate com um cálculo independente do mesmo algoritmo (CRC16/CCITT-FALSE)', () => {
  const payload = gerarPayloadPix({ chave: '11999999999', valor: 9.9, nome: 'Fulano de Tal', cidade: 'Brasilia', txid: '***' });
  const semCrc = payload.slice(0, -4);
  const crcDoPayload = payload.slice(-4);
  assert.equal(crcDoPayload, crc16ReferenciaIndependente(semCrc));
});

test('gerarPayloadPix limpa acento e caracteres fora do padrão em nome/cidade', () => {
  const payload = gerarPayloadPix({ chave: 'x@x.com', valor: 10, nome: 'José da Conceição', cidade: 'São Paulo', txid: 't1' });
  const campos = parsearTLV(payload);
  assert.equal(campos['59'], 'JOSE DA CONCEICAO');
  assert.equal(campos['60'], 'SAO PAULO');
});

test('gerarPayloadPix corta txid para só A-Z0-9 e no máximo 25 caracteres', () => {
  const payload = gerarPayloadPix({ chave: 'x@x.com', valor: 10, nome: 'Loja', cidade: 'SP', txid: 'compra-2026-07-22-abc-def-ghi-jkl' });
  const campos = parsearTLV(payload);
  const adicional = parsearTLV(campos['62']);
  assert.ok(adicional['05'].length <= 25);
  assert.ok(/^[A-Z0-9]+$/.test(adicional['05']));
});
