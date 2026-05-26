const axios = require('axios');

// Formata telefone separando DDD e número (formato retornado pelo cnpj.ws)
function formatarTelefone(ddd, numero) {
  if (!ddd || !numero) return null;
  const digits = numero.replace(/\D/g, '');
  if (digits.length === 9) return `(${ddd}) ${digits.slice(0, 5)}-${digits.slice(5)}`;
  if (digits.length === 8) return `(${ddd}) ${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `(${ddd}) ${numero}`;
}

// Busca dados de uma empresa pelo CNPJ via cnpj.ws (fonte do CNPJBIZ)
async function consultarCnpj(cnpj) {
  const cnpjLimpo = cnpj.replace(/[.\-\/]/g, '').trim();

  if (cnpjLimpo.length !== 14) {
    return { sucesso: false, cnpj: cnpjLimpo, erro: 'CNPJ inválido — deve ter 14 dígitos' };
  }

  // Tenta cnpj.ws primeiro (tem email); em caso de falha cai para BrasilAPI
  try {
    const resposta = await axios.get(
      `https://publica.cnpj.ws/cnpj/${cnpjLimpo}`,
      { timeout: 12000 }
    );
    const d   = resposta.data;
    const est = d.estabelecimento || {};
    const socio = d.socios?.[0] ?? null;
    return {
      sucesso:          true,
      cnpj:             cnpjLimpo,
      razaoSocial:      d.razao_social,
      nomeFantasia:     est.nome_fantasia || d.razao_social,
      email:            est.email || null,
      telefone:         formatarTelefone(est.ddd1, est.telefone1),
      situacao:         est.situacao_cadastral,
      municipio:        est.cidade?.nome ?? null,
      uf:               est.estado?.sigla ?? null,
      cnaePrincipal:    est.atividade_principal?.descricao ?? null,
      socioNome:        socio?.nome ?? null,
      socioQualificacao: socio?.qualificacao_socio?.descricao ?? null
    };
  } catch (erroPrimario) {
    // 404 = CNPJ inválido, não adianta tentar fallback
    if (erroPrimario.response?.status === 404) {
      return { sucesso: false, cnpj: cnpjLimpo, erro: 'CNPJ não encontrado' };
    }

    // Fallback: BrasilAPI (Receita Federal)
    try {
      const fb = await axios.get(
        `https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`,
        { timeout: 12000 }
      );
      const d = fb.data;
      const socio = d.qsa?.[0] ?? null;
      const telRaw = d.ddd_telefone_1 ?? '';
      const telDigits = telRaw.replace(/\D/g, '');
      let telefone = null;
      if (telDigits.length >= 10) {
        const ddd = telDigits.slice(0, 2);
        const num = telDigits.slice(2);
        telefone = formatarTelefone(ddd, num);
      }
      return {
        sucesso:          true,
        cnpj:             cnpjLimpo,
        razaoSocial:      d.razao_social,
        nomeFantasia:     d.nome_fantasia || d.razao_social,
        email:            d.email || null,
        telefone,
        situacao:         d.descricao_situacao_cadastral,
        municipio:        d.municipio,
        uf:               d.uf,
        cnaePrincipal:    d.cnae_fiscal_descricao,
        socioNome:        socio?.nome_socio ?? null,
        socioQualificacao: socio?.qualificacao_socio ?? null,
        fonte:            'brasilapi'
      };
    } catch (erroFallback) {
      return {
        sucesso: false,
        cnpj:    cnpjLimpo,
        erro:    `Falha nas duas fontes — cnpj.ws: ${erroPrimario.message} | BrasilAPI: ${erroFallback.message}`
      };
    }
  }
}

module.exports = { consultarCnpj };
