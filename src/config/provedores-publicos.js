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

  // Provedores/ISPs brasileiros menores — o e-mail continua sendo da pessoa.
  // Todos apareceram na primeira geração da tabela (02/09) com 2.700 a 7.400
  // ocorrências, volume suficiente pra cruzar o limiar de domínio.
  'uai.com.br', 'ibest.com.br', 'sercomtel.com.br', 'vivax.com.br',
  'lpnet.com.br', 'com4.com.br', 'email.com', 'email.com.br',
  'net.com.br', 'gvt.net.br', 'virtua.com.br', 'veloxmail.com',

  // E-mail profissional individual, não de intermediário: cada advogado
  // inscrito na OAB-SP tem o seu.
  'adv.oabsp.org.br',

  // ── Erros de digitação de provedor público ──
  // Quem escreve "gmai.com" é uma pessoa física errando uma letra, não um
  // escritório de contabilidade. Sem estas entradas, a primeira geração da
  // tabela marcou 32.847 e-mails legítimos como máscara — o segundo maior
  // grupo depois da Contabilizei. Descoberto conferindo a lista gerada em
  // 2026-09-02, e é o tipo de coisa que só aparece olhando o resultado real.
  'gmai.com', 'gamil.com', 'gmal.com', 'gmial.com', 'gmail.con', 'gmail.co',
  'gmailcom.com', 'hotmai.com', 'hotmial.com', 'hotmail.con', 'hotmail.co',
  'htomail.com', 'outlok.com', 'outllok.com', 'yaho.com', 'yahoo.co',
  'terra.com', 'uol.com', 'bol.com',
]);

function ehProvedorPublico(dominio) {
  return PROVEDORES_PUBLICOS.has(String(dominio || '').trim().toLowerCase());
}

module.exports = { PROVEDORES_PUBLICOS, ehProvedorPublico };
