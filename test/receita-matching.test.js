const test = require('node:test');
const assert = require('node:assert/strict');
const { expandirTermos, expandirCodigos, casaTermo, sugerirTermos, normalizar } = require('../src/tools/receita');

test('normalizar remove acento e coloca em maiúsculo', () => {
  assert.equal(normalizar('Psicólogo'), 'PSICOLOGO');
  assert.equal(normalizar('São Paulo'), 'SAO PAULO');
});

test('expandirTermos inclui o sinônimo mapeado para um nicho conhecido', () => {
  const termos = expandirTermos('petshop');
  assert.ok(termos.includes('ANIMAIS DE ESTIMACAO'), termos.join(', '));
});

test('expandirTermos ignora tokens com menos de 3 letras', () => {
  const termos = expandirTermos('ir');
  assert.deepEqual(termos, []);
});

test('expandirTermos funciona com nicho fora do dicionário (usa o próprio termo)', () => {
  const termos = expandirTermos('confeitaria');
  assert.ok(termos.includes('CONFEITARIA'));
});

test('sugerirTermos aponta o nicho mais próximo para erro de digitação', () => {
  const sugestoes = sugerirTermos('dentsta');
  assert.ok(sugestoes.some(s => s.toUpperCase() === 'DENTISTA'), sugestoes.join(', '));
});

test('sugerirTermos devolve lista vazia para entrada vazia', () => {
  assert.deepEqual(sugerirTermos(''), []);
});

// Regressão do bug reportado pelo gestor na homologação: a planilha de
// "consultório ambiental" veio com CNAEs de escritório de advocacia,
// consultoria de TI, auditoria atuarial etc. Causa: "consultório" vira o
// stem "CONSULTOR", que bate em qualquer "Consultoria..." do CNAE,
// independente da área. Ver PALAVRAS_AMBIGUAS_PREFIXOS em
// src/config/sinonimos-cnae.js.
test('expandirTermos descarta palavra ambígua (consultório) quando há palavra mais específica no nicho', () => {
  const termos = expandirTermos('consultório ambiental');
  assert.ok(!termos.includes('CONSULTOR'), termos.join(', '));
  assert.ok(termos.includes('AMBIENTAL'), termos.join(', '));
});

test('expandirTermos descarta palavra ambígua (clínica) quando há especialidade no nicho', () => {
  const termos = expandirTermos('clínica odontológica');
  assert.ok(!termos.includes('CLINIC'), termos.join(', '));
  assert.ok(termos.includes('ODONTOLOGICA'), termos.join(', '));
});

test('expandirTermos ainda usa a palavra ambígua como fallback quando é a única do nicho', () => {
  const termos = expandirTermos('consultório');
  assert.ok(termos.includes('CONSULTOR'), termos.join(', '));
});

test('expandirCodigos retorna a lista curada de CNAEs pra nicho sem palavra-raiz confiável (ambiental)', () => {
  const codigos = expandirCodigos('consultório ambiental');
  assert.ok(codigos.includes('3900500'), codigos.join(', '));
  assert.ok(codigos.length > 0);
});

test('expandirCodigos devolve lista vazia pra nicho sem mapeamento direto', () => {
  assert.deepEqual(expandirCodigos('contabilidade'), []);
});

test('expandirCodigos cobre oficina/mecânico/autopeças/transportadora com lista curada (raiz de texto genérica demais)', () => {
  assert.ok(expandirCodigos('oficina mecânica').length > 0);
  assert.ok(expandirCodigos('autopeças').length > 0);
  assert.ok(expandirCodigos('transportadora').length > 0);
});

// casaTermo: achado na auditoria completa do dicionário em 2026-08-17 —
// palavras curtas/comuns em português são prefixo de palavras totalmente
// sem relação (ex.: "móveis" é prefixo... e também aparece NO MEIO de
// "automóveis"/"imóveis"). `casaTermo` exige que o termo apareça no
// início de uma palavra da descrição, não em qualquer lugar.
test('casaTermo não casa termo de uma palavra no meio de outra palavra (móveis dentro de automóveis)', () => {
  assert.equal(casaTermo('FABRICACAO DE AUTOMOVEIS', 'MOVEIS'), false);
  assert.equal(casaTermo('COMPRA E VENDA DE IMOVEIS PROPRIOS', 'MOVEIS'), false);
  assert.equal(casaTermo('FABRICACAO DE MOVEIS COM PREDOMINANCIA DE MADEIRA', 'MOVEIS'), true);
});

test('casaTermo ainda usa substring simples pra termo de frase (com espaço)', () => {
  assert.equal(casaTermo('CRIACAO DE ANIMAIS DE ESTIMACAO', 'ANIMAIS DE ESTIMACAO'), true);
});

test('expandirTermos não gera mais o stem perigoso de MOVEIS/SEGUROS/PET/BAR que colidia com outra palavra', () => {
  // "pet"/"bar" têm sinônimo curado e são curtas (<=4): a palavra crua sai
  // do set de matching, só sobra o sinônimo específico.
  assert.ok(!expandirTermos('petshop').includes('PET'));
  assert.ok(!expandirTermos('bar').includes('BAR'));
  // "seguros" tem sinônimo curado (identidade): o stem automático "SEGUR"
  // (que colidia com "segurança") não deve mais ser gerado.
  assert.ok(!expandirTermos('seguros').includes('SEGUR'));
});
