// Provedores de e-mail públicos (história 3.5).
//
// Estes domínios NUNCA podem ser tratados como "máscara", por mais que se
// repitam na base — o `gmail.com` sozinho aparece em 13,08 milhões de
// estabelecimentos, 55% da base inteira. Um filtro por domínio que não
// abrisse exceção pra eles destruiria o produto: o e-mail do gmail é o
// contato legítimo da padaria, da clínica pequena, do prestador autônomo.
//
// O filtro por domínio existe pra pegar o padrão oposto: domínio
// CORPORATIVO de um intermediário (escritório de contabilidade, abridora de
// MEI, banco) cadastrado como contato de milhares de CNPJs de clientes —
// contabilizei.com.br (159.609), maismei.com.br (117.188), citi.com (14.097).
//
// Inclui variações erradas que as pessoas digitam (gmail.com.br não é da
// Google, mas quem escreve isso é uma pessoa física, não um intermediário).

const PROVEDORES_PUBLICOS = new Set([
  // Google / Microsoft / Apple
  'gmail.com', 'gmail.com.br', 'googlemail.com',
  'hotmail.com', 'hotmail.com.br', 'outlook.com', 'outlook.com.br',
  'live.com', 'live.com.br', 'msn.com',
  'icloud.com', 'me.com', 'mac.com',
  // Yahoo
  'yahoo.com', 'yahoo.com.br', 'ymail.com', 'rocketmail.com',
  // Provedores brasileiros
  'terra.com.br', 'uol.com.br', 'bol.com.br', 'ig.com.br', 'globo.com',
  'globomail.com', 'r7.com', 'oi.com.br', 'zipmail.com.br',
  'superig.com.br', 'click21.com.br', 'pop.com.br', 'itelefonica.com.br',
  'brturbo.com.br', 'veloxmail.com.br', 'uolinc.com', 'onda.com.br',
  // Outros internacionais de uso pessoal
  'aol.com', 'protonmail.com', 'proton.me', 'gmx.com', 'mail.com',
  'yandex.com', 'zoho.com', 'tutanota.com',
]);

function ehProvedorPublico(dominio) {
  return PROVEDORES_PUBLICOS.has(String(dominio || '').trim().toLowerCase());
}

module.exports = { PROVEDORES_PUBLICOS, ehProvedorPublico };
