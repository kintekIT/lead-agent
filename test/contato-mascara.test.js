// Testes da política de contato-máscara (história 3.5).
//
// Monta um banco SQLite falso, pequeno e com schema idêntico ao real, e
// exercita a regra de negócio inteira em cima dele — porque o valor da
// história não está numa função pura, e sim na combinação "apaga o campo
// que é máscara, remove o lead só quando os dois forem". Testar só as
// funções puras deixaria justamente essa parte descoberta.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const DB_FALSO = path.join(os.tmpdir(), `receita-teste-${process.pid}.db`);
process.env.RECEITA_DB_PATH = DB_FALSO;

const { buscarLeadsReceita } = require('../src/tools/receita');
const { ehProvedorPublico } = require('../src/config/provedores-publicos');

function montarBanco() {
  fs.rmSync(DB_FALSO, { force: true });
  const db = new Database(DB_FALSO);
  db.exec(`
    CREATE TABLE estabelecimentos (
      cnpj TEXT PRIMARY KEY, cnpj_basico TEXT NOT NULL, nome TEXT,
      email TEXT NOT NULL, telefone TEXT NOT NULL, cnae TEXT NOT NULL,
      uf TEXT NOT NULL, municipio TEXT NOT NULL, logradouro TEXT,
      numero TEXT, bairro TEXT, cep TEXT, matriz INTEGER DEFAULT 1);
    CREATE TABLE empresas (cnpj_basico TEXT PRIMARY KEY, razao_social TEXT);
    CREATE TABLE cnaes (codigo TEXT PRIMARY KEY, descricao TEXT);
    CREATE TABLE municipios (codigo TEXT PRIMARY KEY, nome TEXT);
    CREATE TABLE emails_genericos    (email    TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);
    CREATE TABLE dominios_genericos  (dominio  TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);
    CREATE TABLE telefones_genericos (telefone TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);

    INSERT INTO cnaes VALUES ('6920601', 'ATIVIDADES DE CONTABILIDADE');
    INSERT INTO municipios VALUES ('1', 'SAO PAULO');

    -- máscaras conhecidas
    INSERT INTO emails_genericos    VALUES ('meucnpj@contabilizei.com.br', 128766);
    INSERT INTO dominios_genericos  VALUES ('maismei.com.br', 117188);
    INSERT INTO telefones_genericos VALUES ('(41) 9788-0145', 83768);
  `);

  const inserir = db.prepare(`INSERT INTO estabelecimentos
    (cnpj, cnpj_basico, nome, email, telefone, cnae, uf, municipio, matriz)
    VALUES (?, ?, ?, ?, ?, '6920601', 'SP', 'SAO PAULO', 1)`);

  // 1. tudo limpo — sai inteiro
  inserir.run('1', '1', 'LIMPA LTDA', 'contato@limpa.com.br', '(11) 91234-5678');
  // 2. e-mail exato é máscara, telefone é bom — fica, e-mail apagado
  inserir.run('2', '2', 'EMAIL RUIM LTDA', 'meucnpj@contabilizei.com.br', '(11) 93333-4444');
  // 3. domínio é máscara, telefone é bom — fica, e-mail apagado
  inserir.run('3', '3', 'DOMINIO RUIM LTDA', 'cliente987@maismei.com.br', '(11) 95555-6666');
  // 4. telefone é máscara, e-mail é bom — fica, telefone apagado
  inserir.run('4', '4', 'TEL RUIM LTDA', 'contato@telruim.com.br', '(41) 9788-0145');
  // 5. os dois são máscara — sai da lista
  inserir.run('5', '5', 'TUDO RUIM LTDA', 'meucnpj@contabilizei.com.br', '(41) 9788-0145');

  db.prepare('INSERT INTO empresas VALUES (?, ?)').run('"1"', 'LIMPA LTDA');
  db.close();
}

test('política de contato-máscara: apaga o campo ruim e descarta só quem tem os dois', (t) => {
  montarBanco();
  t.after(() => fs.rmSync(DB_FALSO, { force: true }));

  const r = buscarLeadsReceita('contabilidade', 'Sao Paulo SP', 50);
  assert.equal(r.sucesso, true);

  const porCnpj = Object.fromEntries(r.leads.map((l) => [l.cnpj, l]));

  // quem tem os dois contatos mascarados não pode ser entregue: não há como
  // falar com a empresa, e cobraria um crédito por nada
  assert.equal(porCnpj['5'], undefined, 'lead com e-mail E telefone máscara deveria ter sido descartado');

  // os outros quatro sobrevivem
  assert.equal(r.leads.length, 4);

  // contato bom permanece intacto
  assert.equal(porCnpj['1'].email, 'contato@limpa.com.br');
  assert.equal(porCnpj['1'].telefone, '(11) 91234-5678');

  // e-mail exato mascarado é apagado, telefone bom fica
  assert.equal(porCnpj['2'].email, '');
  assert.equal(porCnpj['2'].telefone, '(11) 93333-4444');

  // domínio mascarado também apaga o e-mail, mesmo com endereço único
  assert.equal(porCnpj['3'].email, '');
  assert.equal(porCnpj['3'].telefone, '(11) 95555-6666');

  // telefone mascarado é apagado, e-mail bom fica
  assert.equal(porCnpj['4'].telefone, '');
  assert.equal(porCnpj['4'].email, 'contato@telruim.com.br');

  // as colunas auxiliares não vazam pro resultado (iriam parar na planilha)
  assert.equal('email_mascara' in porCnpj['1'], false);
  assert.equal('telefone_mascara' in porCnpj['1'], false);
});

test('avisa quantos contatos foram removidos, pra decisão não ficar invisível', (t) => {
  montarBanco();
  t.after(() => fs.rmSync(DB_FALSO, { force: true }));

  const r = buscarLeadsReceita('contabilidade', 'Sao Paulo SP', 50);
  const aviso = r.avisos.find((a) => /contato\(s\) de escrit/.test(a));
  assert.ok(aviso, 'deveria avisar sobre os contatos removidos');
  assert.match(aviso, /^3 contato/); // leads 2, 3 e 4
});

test('sem as tabelas de máscara a busca não quebra — só avisa', (t) => {
  montarBanco();
  const db = new Database(DB_FALSO);
  db.exec('DROP TABLE emails_genericos; DROP TABLE dominios_genericos; DROP TABLE telefones_genericos;');
  db.close();
  t.after(() => fs.rmSync(DB_FALSO, { force: true }));

  const r = buscarLeadsReceita('contabilidade', 'Sao Paulo SP', 50);
  assert.equal(r.sucesso, true);
  assert.equal(r.leads.length, 5, 'sem as tabelas, nenhum lead é filtrado');
  assert.ok(r.avisos.some((a) => /não foi gerado/.test(a)));
});

test('provedor público nunca é tratado como máscara — gmail é 55% da base', () => {
  assert.equal(ehProvedorPublico('gmail.com'), true);
  assert.equal(ehProvedorPublico('GMAIL.COM'), true);       // case-insensitive
  assert.equal(ehProvedorPublico('hotmail.com.br'), true);
  assert.equal(ehProvedorPublico('uol.com.br'), true);
  assert.equal(ehProvedorPublico('gmail.com.br'), true);    // erro de digitação comum, ainda é pessoa física
  assert.equal(ehProvedorPublico('contabilizei.com.br'), false);
  assert.equal(ehProvedorPublico('maismei.com.br'), false);
  assert.equal(ehProvedorPublico(''), false);
  assert.equal(ehProvedorPublico(null), false);
});
