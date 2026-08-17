// Confere se cada raiz do dicionário de sinônimos (src/config/sinonimos-cnae.js)
// aparece em pelo menos uma descrição real da tabela `cnaes` do banco da
// Receita Federal. Rodar sempre que o dicionário mudar e o banco estiver
// disponível:
//
//   npm run validar-sinonimos
//
// Sai com código 1 se alguma raiz não bater com nada (para uso em CI/pre-commit).

const path = require('path');
const Database = require('better-sqlite3');
const {
  SINONIMOS_VALIDADOS,
  SINONIMOS_NOVOS_PENDENTE_VALIDACAO,
  CNAES_POR_TERMO,
} = require('../config/sinonimos-cnae');

const DB_PATH = path.join(__dirname, '../../data/receita.db');

function normalizar(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function validarGrupo(grupo, nomeGrupo, descricoesNormalizadas) {
  const raizes = [...new Set(Object.values(grupo))];
  let falhas = 0;

  for (const raiz of raizes) {
    const bateu = descricoesNormalizadas.some(d => d.includes(raiz));
    if (!bateu) {
      falhas++;
      console.error(`  ✗ [${nomeGrupo}] raiz "${raiz}" não encontrada em nenhuma descrição de CNAE`);
    }
  }

  return falhas;
}

// Confere se cada código listado em CNAES_POR_TERMO (nichos mapeados direto
// por código, sem palavra-raiz confiável — ex.: "ambiental") existe de fato
// na tabela `cnaes`, pra pegar erro de digitação no código.
function validarCodigos(cnaesPorTermo, codigosValidos) {
  let falhas = 0;
  for (const [termo, codigos] of Object.entries(cnaesPorTermo)) {
    for (const codigo of codigos) {
      if (!codigosValidos.has(codigo)) {
        falhas++;
        console.error(`  ✗ [códigos diretos] "${termo}" referencia o código "${codigo}", que não existe na tabela cnaes`);
      }
    }
  }
  return falhas;
}

function main() {
  let db;
  try {
    db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.error(`Não foi possível abrir ${DB_PATH}: ${err.message}`);
    console.error('Rode este script numa máquina com data/receita.db disponível.');
    process.exitCode = 1;
    return;
  }

  const linhasCnaes = db.prepare('SELECT codigo, descricao FROM cnaes').all();
  const descricoes = linhasCnaes.map(r => normalizar(r.descricao));
  const codigosValidos = new Set(linhasCnaes.map(r => r.codigo));
  db.close();

  console.log(`Validando sinônimos contra ${descricoes.length} descrições de CNAE...\n`);

  const falhasValidados = validarGrupo(SINONIMOS_VALIDADOS, 'validados', descricoes);
  const falhasNovos = validarGrupo(SINONIMOS_NOVOS_PENDENTE_VALIDACAO, 'novos/pendentes', descricoes);
  const falhasCodigos = validarCodigos(CNAES_POR_TERMO, codigosValidos);
  const total = falhasValidados + falhasNovos + falhasCodigos;

  if (total === 0) {
    console.log('✓ Todos os sinônimos e códigos diretos batem com a base de CNAE.');
  } else {
    console.log(`\n✗ ${total} problema(s) encontrado(s). Corrija em src/config/sinonimos-cnae.js.`);
    process.exitCode = 1;
  }
}

main();
