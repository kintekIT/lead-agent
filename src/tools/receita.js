const Database = require('better-sqlite3');
const path     = require('path');
const {
  SINONIMOS,
  CNAES_POR_TERMO,
  CNAES_EXCLUIDOS_POR_TERMO,
  ehPalavraAmbigua,
} = require('../config/sinonimos-cnae');

// RECEITA_DB_PATH permite apontar pra outro banco sem tocar no de produção.
// Existe por dois motivos concretos: os testes montam um banco falso pequeno
// pra exercitar as regras de filtro (história 3.5), e a atualização mensal
// (Épico 7.6) constrói a base nova num arquivo separado antes de trocar.
const DB_PATH = process.env.RECEITA_DB_PATH || path.join(__dirname, '../../data/receita.db');

function normalizar(str) {
  return String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

function parsearRegiao(regiao) {
  const m = regiao.trim().match(/^(.*?)\s+([A-Za-z]{2})$/);
  if (m) return { cidade: normalizar(m[1].trim()), uf: m[2].toUpperCase() };
  return { cidade: normalizar(regiao.trim()), uf: null };
}

// Confere se `termo` aparece na descrição de forma segura pra matching:
// - termo com espaço (frase curada, ex.: "ANIMAIS DE ESTIMACAO"): continua
//   checado como substring simples — já é específico o bastante pra não
//   colidir com nada por acidente.
// - termo de uma palavra só: só casa se aparecer no INÍCIO de uma palavra
//   da descrição, nunca no meio. Isso evita colisão tipo "móveis" casando
//   dentro de "automóveis"/"imóveis", ou "bar" dentro de "embarcações".
// Não resolve toda colisão possível — "medic" ainda bate em "medição"
// porque as duas palavras realmente começam iguais em português; isso
// exige lista curada de código (CNAES_POR_TERMO), não dá pra generalizar
// só com string.
function casaTermo(descricaoNormalizada, termo) {
  if (termo.includes(' ')) return descricaoNormalizada.includes(termo);
  return descricaoNormalizada.split(/[^A-Z]+/).some(palavra => palavra.startsWith(termo));
}

function expandirTermos(nicho) {
  const base = normalizar(nicho).split(/\s+/).filter(t => t.length >= 3);
  const especificas = new Set();
  const genericas   = new Set();

  for (const t of base) {
    const destino = ehPalavraAmbigua(t) ? genericas : especificas;
    const temSinonimo = Boolean(SINONIMOS[t]);

    // Palavra de 3-4 letras com sinônimo curado: a palavra crua não entra
    // no set — em português, palavra tão curta quase sempre é prefixo de
    // outra palavra sem relação nenhuma (ex.: "pet" prefixa "petróleo" e
    // "espetáculo"; "bar" prefixa "barragem" e "barro"). O sinônimo curado
    // já é específico o bastante sozinho.
    if (!(temSinonimo && t.length <= 4)) destino.add(t);

    if (temSinonimo) {
      destino.add(SINONIMOS[t]);
    } else if (t.length > 6) {
      // Stem simples (corta sufixo pra casar variações, ex.: odontologia →
      // odontolog) só entra quando NÃO há sinônimo curado — é um fallback
      // pra nicho fora do dicionário. Quando já existe mapeamento manual,
      // confiar nele é mais seguro que cortar 2 letras às cegas (ex.:
      // "SEGUROS" → stem "SEGUR" colidia com "segurança").
      destino.add(t.slice(0, -2));
    }
  }

  // Palavras "ambíguas" (consultório, escritório, clínica — ver
  // PALAVRAS_AMBIGUAS_PREFIXOS em config/sinonimos-cnae.js) só entram na
  // busca quando são a ÚNICA palavra do nicho, isto é, quando não há
  // termo mais específico pra usar no lugar delas. Ex.: em "consultório
  // ambiental" a busca usa só os termos de "ambiental"; digitado sozinho,
  // "consultório" ainda cai no fallback abaixo em vez de não achar nada.
  return especificas.size > 0 ? [...especificas] : [...genericas];
}

// Alguns nichos não têm uma palavra-raiz confiável na nomenclatura do CNAE
// (ex.: "ambiental" — ver CNAES_POR_TERMO). Pra esses, a busca por texto é
// complementada com uma lista curada de códigos.
function expandirCodigos(nicho) {
  const base = normalizar(nicho).split(/\s+/).filter(t => t.length >= 3);
  const codigos = new Set();
  for (const t of base) {
    if (CNAES_POR_TERMO[t]) CNAES_POR_TERMO[t].forEach(c => codigos.add(c));
  }
  return [...codigos];
}

// Códigos que, mesmo casando por texto com algum termo (ver CNAES_EXCLUIDOS_POR_TERMO),
// são falso-positivo conhecido e sempre descartados da busca textual.
function codigosExcluidos(termos) {
  const excluidos = new Set();
  for (const t of termos) {
    if (CNAES_EXCLUIDOS_POR_TERMO[t]) CNAES_EXCLUIDOS_POR_TERMO[t].forEach(c => excluidos.add(c));
  }
  return excluidos;
}

function distanciaLevenshtein(a, b) {
  const linhas = a.length + 1;
  const colunas = b.length + 1;
  const dp = Array.from({ length: linhas }, () => new Array(colunas).fill(0));
  for (let i = 0; i < linhas; i++) dp[i][0] = i;
  for (let j = 0; j < colunas; j++) dp[0][j] = j;
  for (let i = 1; i < linhas; i++) {
    for (let j = 1; j < colunas; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[linhas - 1][colunas - 1];
}

// Sugere os nichos conhecidos mais próximos do termo digitado, para o caso de
// erro de digitação ou nicho fora do dicionário (ex: "dentsta" → "dentista").
function sugerirTermos(nicho, limite = 3) {
  const alvo = normalizar(nicho).split(/\s+/)[0] || '';
  if (!alvo) return [];

  const chaves = Object.keys(SINONIMOS);
  return chaves
    .map(chave => ({ chave, dist: distanciaLevenshtein(alvo, chave) }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limite)
    .map(({ chave }) => chave.charAt(0) + chave.slice(1).toLowerCase());
}

// Descarta telefones-lixo comuns na base da Receita: números onde o
// assinante (tudo após o DDD) é o mesmo dígito repetido — ex.: (11) 9999-9999,
// (11) 0000-0000, (11) 1111-1111. Esses números nunca completam uma ligação.
function ehTelefoneValido(telefone) {
  const digitos = String(telefone || '').replace(/\D/g, '');
  if (digitos.length < 10) return false;

  const assinante = digitos.slice(2);
  if (/^(\d)\1+$/.test(assinante)) return false;

  return true;
}

// Monta uma única string de endereço a partir dos campos separados do
// estabelecimento, omitindo o que não vier preenchido.
function formatarEndereco({ logradouro, numero, bairro, cep } = {}) {
  const partes = [];
  if (logradouro) partes.push(numero ? `${logradouro}, ${numero}` : logradouro);
  if (bairro) partes.push(bairro);
  if (cep) partes.push(`CEP ${cep}`);
  return partes.join(' - ');
}

function buscarLeadsReceita(nicho, regiao, quantidade) {
  const db = new Database(DB_PATH, { readonly: true });
  db.function('telefone_valido', (telefone) => (ehTelefoneValido(telefone) ? 1 : 0));

  try {
    // 1. CNAEs: matching em JS (SQLite upper() ignora acentos)
    const termos = expandirTermos(nicho);
    const codigosDiretos = expandirCodigos(nicho);
    const excluidos = codigosExcluidos(termos);
    const cnaesPorTexto = db.prepare('SELECT codigo, descricao FROM cnaes').all()
      .filter(c => !excluidos.has(c.codigo) && termos.some(t => casaTermo(normalizar(c.descricao), t)))
      .map(c => c.codigo);
    const cnaeCodigos = [...new Set([...codigosDiretos, ...cnaesPorTexto])];

    if (cnaeCodigos.length === 0) {
      const sugestoes = sugerirTermos(nicho);
      const dica = sugestoes.length
        ? `Você quis dizer: ${sugestoes.join(', ')}?`
        : 'Tente: odontologia, restaurante, contábil, engenharia, farmácia...';
      return {
        sucesso: false,
        mensagem: `Nenhum CNAE encontrado para "${nicho}". ${dica}`,
      };
    }

    // 2. Município: busca na tabela municipios (5572 linhas) — muito mais rápido
    //    que SELECT DISTINCT na tabela de 24M linhas
    const { cidade, uf } = parsearRegiao(regiao);
    let nomesMunicipio = [];

    if (cidade) {
      // municipios.nome está armazenado com aspas ex: '"SAO PAULO"'
      // LIKE '%SAO PAULO%' funciona pois a string contém o nome mesmo com aspas
      const munRows = db.prepare(
        `SELECT REPLACE(REPLACE(nome, '"', ''), '"', '') AS n FROM municipios WHERE nome LIKE ?`
      ).all(`%${cidade}%`);

      nomesMunicipio = munRows.map(r => r.n).filter(n => n && normalizar(n).includes(cidade));

      if (nomesMunicipio.length === 0) {
        return { sucesso: false, mensagem: `Município "${regiao}" não encontrado na base.` };
      }
    }

    // 3. Query principal — usa idx_cnae_uf_mun
    // JOIN com empresas: empresas.cnpj_basico tem aspas ex: '"41273589"'
    // mas estabelecimentos.cnpj_basico é limpo "41273589"
    const munPH = nomesMunicipio.map(() => '?').join(',');

    // Contato-máscara (história 3.5): contato que não é da empresa, e sim de
    // um intermediário (contabilidade, abridora de MEI, banco) que cadastrou
    // o próprio dado no CNPJ de milhares de clientes. Um em cada cinco
    // registros da base tem pelo menos um contato assim.
    //
    // As três tabelas são geradas por src/scripts/detectar-contatos-mascara.js
    // e podem não existir (base recém-importada, ou script nunca rodado).
    // Cada filtro é aplicado só se a sua tabela existir — a busca nunca
    // quebra por falta delas, mas avisa.
    const avisos = [];
    const existeTabela = (nome) => Boolean(db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(nome));

    const temEmails    = existeTabela('emails_genericos');
    const temDominios  = existeTabela('dominios_genericos');
    const temTelefones = existeTabela('telefones_genericos');

    if (!temEmails && !temDominios && !temTelefones) {
      avisos.push('Filtro de contato-máscara ainda não foi gerado (rode: npm run detectar-contatos-mascara). A busca pode trazer e-mail e telefone de escritórios de contabilidade.');
    }

    // Expressões SQL que dizem, por linha, se cada contato é máscara. Viram
    // '0' quando a tabela correspondente não existe, então o SQL continua
    // válido e a condição simplesmente nunca casa.
    const condEmailMascara = [
      temEmails   && `e.email IN (SELECT email FROM emails_genericos)`,
      temDominios && `lower(substr(e.email, instr(e.email, '@') + 1)) IN (SELECT dominio FROM dominios_genericos)`,
    ].filter(Boolean).join(' OR ') || '0';

    const condTelMascara = temTelefones
      ? `e.telefone IN (SELECT telefone FROM telefones_genericos)`
      : '0';

    let sql = `
      SELECT
        e.cnpj,
        REPLACE(COALESCE(NULLIF(TRIM(e.nome), ''), em.razao_social), '"', '') AS nome_fantasia,
        REPLACE(em.razao_social, '"', '') AS razao_social,
        e.email,
        e.telefone,
        e.uf,
        e.municipio,
        e.logradouro,
        e.numero,
        e.bairro,
        e.cep,
        REPLACE(c.descricao, '"', '') AS atividade,
        (${condEmailMascara}) AS email_mascara,
        (${condTelMascara})   AS telefone_mascara
      FROM estabelecimentos e
      LEFT JOIN empresas em ON em.cnpj_basico = '"' || e.cnpj_basico || '"'
      LEFT JOIN cnaes c ON c.codigo = e.cnae
      WHERE e.cnae = ?
        AND e.matriz = 1
        AND telefone_valido(e.telefone) = 1
    `;

    if (uf) sql += ' AND e.uf = ?';
    if (nomesMunicipio.length > 0) sql += ` AND e.municipio IN (${munPH})`;

    // Política de descarte (história 3.5): o lead só sai quando os DOIS
    // contatos são máscara — aí não há como falar com a empresa e entregá-lo
    // seria cobrar um crédito por nada. Se só um for máscara, o lead fica e
    // o campo ruim é apagado depois (ver limpeza abaixo): sobrando e-mail OU
    // telefone da própria empresa, o lead ainda serve.
    //
    // A diferença é grande: descartar quando qualquer contato é máscara
    // eliminaria 22,3% da base; só quando ambos são, 10,9% (medido em
    // 2026-09-02 — ver CONTEXTO.md seção 37).
    if (temEmails || temDominios || temTelefones) {
      sql += ` AND NOT ((${condEmailMascara}) AND (${condTelMascara}))`;
    }
    sql += ' LIMIT ?';

    // Uma query por CNAE (em vez de um único WHERE cnae IN (...) com LIMIT):
    // quando o nicho digitado casa com várias atividades diferentes (ex.:
    // "petshop" bate em canil/criação E em varejo de pet shop), um único
    // LIMIT sem ORDER BY sempre esgotava o CNAE de código numericamente menor
    // primeiro. Buscando até `quantidade` por CNAE e intercalando os lotes
    // round-robin garante uma amostra representativa de todas as atividades.
    const stmt = db.prepare(sql);
    const porCnae = cnaeCodigos.map(codigo => {
      const params = [codigo];
      if (uf) params.push(uf);
      if (nomesMunicipio.length > 0) params.push(...nomesMunicipio);
      params.push(quantidade);
      return stmt.all(...params);
    });

    const leads = [];
    for (let i = 0; leads.length < quantidade && porCnae.some(lote => lote.length > i); i++) {
      for (const lote of porCnae) {
        if (leads.length >= quantidade) break;
        if (lote[i]) leads.push(lote[i]);
      }
    }

    if (leads.length === 0) {
      return {
        sucesso: false,
        mensagem: `Sem resultados para "${nicho}" em "${regiao}". CNAEs encontrados: ${cnaeCodigos.length}. Tente uma região maior ou palavras-chave diferentes.`,
      };
    }

    // Apaga o contato que é máscara, mantendo o lead (história 3.5). Entregar
    // o telefone do contador é pior que entregar o campo vazio: o cliente
    // liga, perde tempo e conclui que o lead é ruim. Os que chegaram aqui têm
    // garantidamente ao menos um contato real — o SQL acima já descartou quem
    // tinha os dois mascarados.
    let camposLimpos = 0;
    for (const lead of leads) {
      if (lead.email_mascara) { lead.email = ''; camposLimpos++; }
      if (lead.telefone_mascara) { lead.telefone = ''; camposLimpos++; }
      delete lead.email_mascara;
      delete lead.telefone_mascara;
    }
    if (camposLimpos > 0) {
      avisos.push(`${camposLimpos} contato(s) de escritório de contabilidade foram removidos dos leads — os campos ficaram em branco, e cada lead entregue mantém ao menos um contato real.`);
    }

    return { sucesso: true, leads, cnaesUsados: cnaeCodigos.length, avisos };
  } finally {
    db.close();
  }
}

module.exports = {
  buscarLeadsReceita,
  expandirTermos,
  expandirCodigos,
  sugerirTermos,
  normalizar,
  casaTermo,
  ehTelefoneValido,
  formatarEndereco,
};
