const test = require('node:test');
const assert = require('node:assert/strict');
const { tamanhoPool } = require('../src/config/pool-dedup');

test('tamanhoPool multiplica a quantidade pedida para sobrar candidatos no dedup', () => {
  assert.equal(tamanhoPool(20), 60);
  assert.equal(tamanhoPool(100), 300);
});

test('tamanhoPool nunca passa do teto, mesmo com quantidade no limite máximo (1000)', () => {
  assert.equal(tamanhoPool(1000), 3000);
  assert.ok(tamanhoPool(1000) <= 3000);
});
