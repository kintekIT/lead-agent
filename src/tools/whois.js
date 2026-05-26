const whois = require('whois');

// Consulta o WHOIS de um domínio e retorna os dados do proprietário
async function consultarWhois(dominio) {
  return new Promise((resolve) => {
    // Remove "http://", "https://", "www." do domínio se existirem
    const dominioLimpo = dominio
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .split('/')[0]
      .trim();

    whois.lookup(dominioLimpo, { server: 'whois.registro.br' }, (err, dados) => {
      if (err) {
        resolve({
          sucesso: false,
          dominio: dominioLimpo,
          erro: `Não foi possível consultar o WHOIS: ${err.message}`
        });
        return;
      }

      const resultado = parseWhois(dados, dominioLimpo);
      resolve(resultado);
    });
  });
}

// Interpreta o texto bruto do WHOIS e extrai as informações importantes
function parseWhois(dadosBrutos, dominio) {
  if (!dadosBrutos || dadosBrutos.includes('No match for')) {
    return {
      sucesso: false,
      dominio,
      erro: 'Domínio não encontrado no registro.br'
    };
  }

  // Detecta se é CPF ou CNPJ
  const matchCnpj = dadosBrutos.match(/nic-br-registered-id:\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
  const matchCpf = dadosBrutos.match(/nic-br-registered-id:\s*([\d\.\-\*\/]+)/i);

  // Extrai email (pode estar mascarado por LGPD)
  const matchEmail = dadosBrutos.match(/e-mail:\s*([^\s\n]+)/i);
  const email = matchEmail ? matchEmail[1].trim() : null;

  // Extrai nome do responsável — registro.br usa "owner:", "responsible:" ou "person:"
  const matchNome = dadosBrutos.match(/(?:responsible|owner|person):\s*(.+)/i);
  const nome = matchNome ? matchNome[1].trim() : null;

  // Extrai telefone
  const matchTelefone = dadosBrutos.match(/phone:\s*(.+)/i);
  const telefone = matchTelefone ? matchTelefone[1].trim() : null;

  if (matchCnpj) {
    // Domínio registrado por empresa (CNPJ)
    return {
      sucesso: true,
      dominio,
      tipo: 'CNPJ',
      cnpj: matchCnpj[1],
      nome,
      email,
      telefone,
      dadosBrutos: dadosBrutos.substring(0, 2000) // Limitado para não sobrecarregar
    };
  } else if (matchCpf) {
    // Domínio registrado por pessoa física (CPF)
    const cpfValor = matchCpf[1];
    const cpfMascarado = cpfValor.includes('*');

    if (cpfMascarado || !email) {
      return {
        sucesso: true,
        dominio,
        tipo: 'CPF',
        cpf: cpfValor, // valor mascarado ex: ***.456.789-**
        cpfMascarado: true,
        aviso: 'Dados mascarados pela LGPD — dados pessoais não disponíveis publicamente',
        nome,
        email,
        telefone
      };
    }

    return {
      sucesso: true,
      dominio,
      tipo: 'CPF',
      cpf: cpfValor,
      cpfMascarado: false,
      nome,
      email,
      telefone
    };
  } else {
    return {
      sucesso: false,
      dominio,
      erro: 'Não foi possível identificar CPF ou CNPJ nos dados do WHOIS',
      dadosParciais: dadosBrutos.substring(0, 500)
    };
  }
}

module.exports = { consultarWhois };
