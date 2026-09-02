// Detecta "contatos-máscara" na base da Receita (história 3.5) — contato que
// não é da empresa, e sim de um intermediário que cadastrou o próprio dado no
// CNPJ de milhares de clientes (escritório de contabilidade, abridora de MEI,
// banco).
//
// Substitui o antigo detectar-emails-genericos.js, que só cobria e-mail exato.
// Gera três tabelas auxiliares dentro do próprio receita.db:
//
//   emails_genericos     e-mail exato repetido      (ex.: meucnpj@contabilizei.com.br, 128.766x)
//   dominios_genericos   domínio corporativo        (ex.: contabilizei.com.br, 159.609x)
//   telefones_genericos  telefone repetido          (ex.: (41) 9788-0145, 83.768x)
//
// Por que o domínio precisa existir além do e-mail exato: se o intermediário
// cadastra um endereço diferente por cliente (cliente1@x.com.br,
// cliente2@x.com.br), cada e-mail aparece uma vez só e passa limpo pelo filtro
// de e-mail exato. Só a contagem por domínio pega esse padrão.
//
// Uso:
//   npm run detectar-contatos-mascara
//   npm run detectar-contatos-mascara -- --telefone=10 --email=20 --dominio=30
//
// RODAR DE NOVO APÓS CADA ATUALIZAÇÃO MENSAL DA BASE (Épico 7.6): a troca do
// receita.db leva estas tabelas junto, e sem elas a busca volta a entregar
// contato de contador — silenciosamente, com um aviso que ninguém lê.

const path = require('path');
const Database = require('better-sqlite3');
const { PROVEDORES_PUBLICOS } = require('../config/provedores-publicos');

const DB_PATH = path.join(__dirname, '../../data/receita.db');

// Limiares escolhidos a partir da distribuição real da base (23,9M linhas,
// medida em 2026-09-02) — ver CONTEXTO.md seção 37.
const PADRAO = { telefone: 10, email: 20, dominio: 30 };

function lerLimiares(argv) {
  const lim = { ...PADRAO };
  for (const arg of argv) {
    const m = /^--(telefone|email|dominio)=(\d+)$/.exec(arg);
    if (m) lim[m[1]] = Number(m[2]);
  }
  return lim;
}

function main() {
  const lim = lerLimiares(process.argv.slice(2));

  let db;
  try {
    db = new Database(DB_PATH, { fileMustExist: true });
  } catch (err) {
    console.error(`Não foi possível abrir ${DB_PATH}: ${err.message}`);
    console.error('Rode este script numa máquina com data/receita.db disponível.');
    process.exitCode = 1;
    return;
  }

  // A base não tem índice em email/telefone, então cada GROUP BY é uma
  // varredura completa. temp_store=FILE evita estourar a memória da VPS
  // (4GB) ao ordenar 23,9M linhas.
  db.pragma('temp_store = FILE');

  console.log('Limiares:', `telefone >= ${lim.telefone}`, `| email >= ${lim.email}`, `| domínio >= ${lim.dominio}`);
  console.log('Varrendo a base inteira três vezes — leva alguns minutos.\n');

  db.exec(`
    CREATE TABLE IF NOT EXISTS emails_genericos    (email    TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS dominios_genericos  (dominio  TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS telefones_genericos (telefone TEXT PRIMARY KEY, ocorrencias INTEGER NOT NULL);
  `);

  const publicos = [...PROVEDORES_PUBLICOS].map((d) => `'${d}'`).join(',');

  const etapas = [
    {
      nome: 'e-mails exatos',
      tabela: 'emails_genericos',
      coluna: 'email',
      sql: `SELECT email AS chave, COUNT(*) AS n FROM estabelecimentos
            WHERE email <> '' GROUP BY email HAVING n >= ${lim.email}`,
    },
    {
      nome: 'domínios corporativos',
      tabela: 'dominios_genericos',
      coluna: 'dominio',
      // A exclusão dos provedores públicos acontece AQUI, na geração — assim
      // a tabela nunca chega a conter gmail.com, e nenhum consumidor dela
      // precisa lembrar de tratar essa exceção.
      sql: `SELECT lower(substr(email, instr(email, '@') + 1)) AS chave, COUNT(*) AS n
            FROM estabelecimentos
            WHERE email <> '' AND instr(email, '@') > 0
              AND lower(substr(email, instr(email, '@') + 1)) NOT IN (${publicos})
            GROUP BY chave HAVING n >= ${lim.dominio}`,
    },
    {
      nome: 'telefones',
      tabela: 'telefones_genericos',
      coluna: 'telefone',
      sql: `SELECT telefone AS chave, COUNT(*) AS n FROM estabelecimentos
            WHERE telefone <> '' GROUP BY telefone HAVING n >= ${lim.telefone}`,
    },
  ];

  for (const etapa of etapas) {
    const inicio = Date.now();
    process.stdout.write(`  ${etapa.nome}... `);

    const linhas = db.prepare(etapa.sql).all();
    const inserir = db.prepare(
      `INSERT INTO ${etapa.tabela} (${etapa.coluna}, ocorrencias) VALUES (?, ?)
       ON CONFLICT(${etapa.coluna}) DO UPDATE SET ocorrencias = excluded.ocorrencias`,
    );
    db.transaction((rows) => {
      db.prepare(`DELETE FROM ${etapa.tabela}`).run();
      for (const { chave, n } of rows) inserir.run(chave, n);
    })(linhas);

    const seg = ((Date.now() - inicio) / 1000).toFixed(0);
    console.log(`${linhas.length.toLocaleString('pt-BR')} registrados (${seg}s)`);

    if (linhas.length) {
      linhas.sort((a, b) => b.n - a.n).slice(0, 5)
        .forEach(({ chave, n }) => console.log(`      ${String(n).padStart(8)}  ${chave}`));
    }
  }

  db.close();
  console.log('\n✓ Tabelas de contato-máscara atualizadas. A busca já passa a usá-las.');
}

main();
