// Sinônimos: termo coloquial digitado pelo usuário → raiz que precisa aparecer
// literalmente (após normalizar: maiúsculo, sem acento) dentro do texto de
// `cnaes.descricao` para o match funcionar — ver `expandirTermos` em
// src/tools/receita.js.
//
// SINONIMOS_VALIDADOS: conferidos manualmente contra o banco real em
// 2026-07-13 (ver CONTEXTO.md, seção 5). Não alterar sem revalidar.
//
// SINONIMOS_NOVOS_PENDENTE_VALIDACAO: mapeados a partir da nomenclatura
// oficial do CNAE 2.3 para a história 3.3 (expansão do dicionário), mas
// SEM confirmação contra o banco real — data/receita.db não estava disponível
// localmente ao escrever este arquivo. Antes de considerar a história 3.3
// concluída, rodar `npm run validar-sinonimos` numa máquina com o banco e
// corrigir qualquer raiz sem correspondência.

const SINONIMOS_VALIDADOS = {
  DENTISTA:       'ODONTOL',
  DENTISTAS:      'ODONTOL',
  DENTAL:         'ODONTOL',
  ODONTOLOGO:     'ODONTOL',
  MEDICO:         'MEDIC',
  MEDICOS:        'MEDIC',
  HOSPITAL:       'HOSPIT',
  CLINICA:        'CLINIC',
  ADVOGADO:       'ADVOCA',
  ADVOGADOS:      'ADVOCA',
  ADVOCACIA:      'ADVOCA',
  CONTADOR:       'CONTAB',
  CONTABILIDADE:  'CONTAB',
  ACADEMIA:       'CONDICIONAMENTO FISICO',
  ACADEMIAS:      'CONDICIONAMENTO FISICO',
  FARMACIA:       'FARMAC',
  SUPERMERCADO:   'SUPERM',
  PADARIA:        'PADARI',
  ELETRICISTA:    'ELETRIC',
  ENGENHEIRO:     'ENGENH',
  ARQUITETO:      'ARQUIT',
  PSICOLOGO:      'PSICOL',
  NUTRICIONISTA:  'NUTRIC',
  FISIOTERAPEUTA: 'FISIOTE',
  VETERINARIO:    'VETERIN',
};

// Confiança alta (nomenclatura CNAE inequívoca) mas ainda não conferida linha
// a linha contra o banco. Nichos citados explicitamente no backlog (3.3):
// petshop, salão de beleza, imobiliária, restaurante, oficina, escola,
// transportadora — mais outros nichos B2B comuns.
const SINONIMOS_NOVOS_PENDENTE_VALIDACAO = {
  PETSHOP:        'ANIMAIS DE ESTIMACAO',
  PET:            'ANIMAIS DE ESTIMACAO',
  SALAO:          'CABELEIREIR',
  CABELEIREIRO:   'CABELEIREIR',
  CABELEIREIRA:   'CABELEIREIR',
  BELEZA:         'BELEZA',
  ESTETICA:       'ESTETICA',
  IMOBILIARIA:    'IMOVEIS',
  IMOVEIS:        'IMOVEIS',
  RESTAURANTE:    'RESTAURANTES',
  PIZZARIA:       'RESTAURANTES',
  LANCHONETE:     'LANCHONETE',
  BAR:            'BARES',
  BARES:          'BARES',
  // baixa confiança: descrições oficiais de nível fundamental/médio usam a
  // palavra "Educação", não "Ensino" — revisar com atenção na validação
  ESCOLA:         'EDUCACAO',
  COLEGIO:        'EDUCACAO',
  IDIOMAS:        'IDIOMAS',
  HOTEL:          'HOTEIS',
  POUSADA:        'HOTEIS',
  CONSTRUTORA:    'CONSTRUCAO DE EDIFICIOS',
  SEGURADORA:     'SEGUROS',
  SEGUROS:        'SEGUROS',
  PUBLICIDADE:    'PUBLICIDADE',
  MARKETING:      'PUBLICIDADE',
  OTICA:          'OPTICA',
  JOALHERIA:      'JOALHERIA',
  PAPELARIA:      'PAPELARIA',
  LIVRARIA:       'LIVROS',
  FLORICULTURA:   'FLORES',
  LAVANDERIA:     'LAVANDERIA',
  PANIFICADORA:   'PADARI',
  SORVETERIA:     'SORVETES',
  AUTOESCOLA:     'FORMACAO DE CONDUTORES',
  SEGURANCA:      'VIGILANCIA',
  VIGILANCIA:     'VIGILANCIA',
  GRAFICA:        'IMPRESSAO',
  CONFEITARIA:    'CONFEITARIA',
  DOCERIA:        'CONFEITARIA',
  MOVEIS:         'MOVEIS',
  TATUAGEM:       'TATUAGEM',
  DESIGNER:       'DESIGN',
  CONSULTORIA:    'CONSULTORIA EM GESTAO',
  FUNERARIA:      'FUNERARI',
};

// Palavras de "tipo de estabelecimento" que, na nomenclatura oficial do
// CNAE, aparecem em áreas completamente diferentes entre si — então quando
// combinadas com outra palavra mais específica no nicho, elas só devem ser
// usadas como *fallback* (nicho digitado com uma palavra só), nunca somadas
// (OR) à palavra específica. Confirmado contra data/receita.db em
// 2026-08-17 — ver detalhe em CONTEXTO.md:
//   - "CONSULTOR" (raiz de consultório/consultoria) bate em 6 CNAEs: TI,
//     atuarial, contábil/tributária, gestão empresarial, publicidade e
//     agronomia/pecuária — nenhum é "consultoria ambiental".
//   - "ESCRITOR" (raiz de escritório) bate em 9 CNAEs: papelaria, móveis e
//     equipamentos de escritório, escritores/artistas — nenhum é jurídico.
//   - "CLINIC" (raiz de clínica, já mapeada em SINONIMOS_VALIDADOS) bate em
//     laboratório clínico, clínica geriátrica e clínica de estética, além
//     da especialidade buscada (ex.: odontologia).
// Ver `expandirTermos` em src/tools/receita.js para como isso é aplicado.
const PALAVRAS_AMBIGUAS_PREFIXOS = ['CONSULTOR', 'ESCRITOR', 'CLINIC'];

// Nichos sem uma palavra-raiz confiável na nomenclatura do CNAE — a busca
// textual não resolve (ou só resolve trazendo ruído demais), então
// mapeamos direto pra uma lista curada de códigos. Conferido manualmente
// contra data/receita.db em 2026-08-17.
const CNAES_POR_TERMO = {
  // "Consultoria/consultório ambiental": a Receita não tem uma categoria
  // única pra isso — a lista abaixo junta gestão de resíduos, estudos
  // geológicos e atividades técnicas de engenharia/arquitetura não
  // especificadas, que juntas cobrem a maior parte do que esse nicho
  // costuma significar na prática.
  AMBIENTAL: [
    '3900500', // Descontaminação e outros serviços de gestão de resíduos
    '3811400', // Coleta de resíduos não-perigosos
    '3812200', // Coleta de resíduos perigosos
    '3821100', // Tratamento e disposição de resíduos não-perigosos
    '3822000', // Tratamento e disposição de resíduos perigosos
    '7119702', // Atividades de estudos geológicos
    '7119799', // Atividades técnicas relacionadas à engenharia e arquitetura não especificadas anteriormente
  ],
  // "Oficina mecânica"/"mecânico": a raiz "MANUTENC" (usada até 2026-08-17
  // em MECANICO e OFICINA) bate em 52 CNAEs de manutenção de QUALQUER
  // coisa — elevador, aeronave, embarcação, computador, cemitério — porque
  // "manutenção e reparação de X" é o padrão de nome usado pra dezenas de
  // setores industriais sem relação nenhuma com oficina automotiva.
  // Restrito aqui só ao que "oficina mecânica" realmente significa no uso
  // comum: conserto de carro/moto.
  OFICINA: [
    '4520001', // Serviços de manutenção e reparação mecânica de veículos automotores
    '4520003', // Serviços de manutenção e reparação elétrica de veículos automotores
    '4520007', // Serviços de instalação, manutenção e reparação de acessórios para veículos automotores
    '4543900', // Manutenção e reparação de motocicletas e motonetas
  ],
  // "Transportadora": a raiz "TRANSPORTE" bate em 53+ CNAEs cobrindo TODO
  // modo de transporte — passageiro de ônibus/metrô/avião, transporte
  // espacial, transporte escolar — quando "transportadora", no uso comum
  // do mercado brasileiro, quase sempre significa empresa de frete/carga.
  // Restrito aos códigos de transporte de carga (rodoviário, ferroviário,
  // marítimo, fluvial, aéreo) e logística/agenciamento de frete.
  TRANSPORTADORA: [
    '4911600', // Transporte ferroviário de carga
    '4930201', // Transporte rodoviário de carga, exceto produtos perigosos e mudanças, municipal
    '4930202', // Transporte rodoviário de carga, exceto produtos perigosos e mudanças, intermunicipal/interestadual/internacional
    '4930203', // Transporte rodoviário de produtos perigosos
    '4930204', // Transporte rodoviário de mudanças
    '5011401', // Transporte marítimo de cabotagem - Carga
    '5012201', // Transporte marítimo de longo curso - Carga
    '5021101', // Transporte por navegação interior de carga, municipal
    '5021102', // Transporte por navegação interior de carga, intermunicipal/interestadual/internacional
    '5120000', // Transporte aéreo de carga
    '5250803', // Agenciamento de cargas, exceto para o transporte marítimo
    '5250804', // Organização logística do transporte de carga
    '5250805', // Operador de transporte multimodal - OTM
  ],
  // "Autopeças": a raiz "PECAS E ACESSORIOS" bate em 58 CNAEs — o sufixo
  // ", peças e acessórios" é usado por dezenas de setores industriais sem
  // relação (móveis, instrumento musical, máquina industrial). Restrito a
  // fabricação/comércio de peças de veículo automotor e moto.
  AUTOPECAS: [
    '2941700', // Fabricação de peças e acessórios para o sistema motor de veículos automotores
    '2942500', // Fabricação de peças e acessórios para os sistemas de marcha e transmissão de veículos automotores
    '2943300', // Fabricação de peças e acessórios para o sistema de freios de veículos automotores
    '2944100', // Fabricação de peças e acessórios para o sistema de direção e suspensão de veículos automotores
    '2949299', // Fabricação de outras peças e acessórios para veículos automotores não especificadas anteriormente
    '4530701', // Comércio por atacado de peças e acessórios novos para veículos automotores
    '4530703', // Comércio a varejo de peças e acessórios novos para veículos automotores
    '4530704', // Comércio a varejo de peças e acessórios usados para veículos automotores
    '4530706', // Representantes comerciais e agentes do comércio de peças e acessórios novos e usados para veículos automotores
    '4541202', // Comércio por atacado de peças e acessórios para motocicletas e motonetas
    '4541205', // Comércio a varejo de peças e acessórios para motocicletas e motonetas
    '4541206', // Comércio a varejo de peças e acessórios novos para motocicletas e motonetas
    '4541207', // Comércio a varejo de peças e acessórios usados para motocicletas e motonetas
    '4542101', // Representantes comerciais e agentes do comércio de motocicletas e motonetas, peças e acessórios
  ],
};
CNAES_POR_TERMO.AMBIENTAIS     = CNAES_POR_TERMO.AMBIENTAL;
CNAES_POR_TERMO.OFICINAS       = CNAES_POR_TERMO.OFICINA;
CNAES_POR_TERMO.MECANICO       = CNAES_POR_TERMO.OFICINA;
CNAES_POR_TERMO.MECANICOS      = CNAES_POR_TERMO.OFICINA;
CNAES_POR_TERMO.MECANICA       = CNAES_POR_TERMO.OFICINA;
CNAES_POR_TERMO.MECANICAS      = CNAES_POR_TERMO.OFICINA;
CNAES_POR_TERMO.TRANSPORTADORAS = CNAES_POR_TERMO.TRANSPORTADORA;

// Colisão residual que nem o word-boundary de `casaTermo` resolve, porque
// as duas palavras realmente começam com as mesmas letras em português:
// "médico"/"medicamento" (raiz MEDIC) vs. "medição" — 8299701 é a única
// ocorrência disso na base inteira (conferido rodando a auditoria completa
// do dicionário em 2026-08-17). Em vez de criar um mecanismo genérico pra
// um caso só, excluímos o código pontualmente.
const CNAES_EXCLUIDOS_POR_TERMO = {
  MEDIC: ['8299701'], // Medição de consumo de energia elétrica, gás e água
};

function ehPalavraAmbigua(palavra) {
  return PALAVRAS_AMBIGUAS_PREFIXOS.some(prefixo => palavra.startsWith(prefixo));
}

module.exports = {
  SINONIMOS: { ...SINONIMOS_VALIDADOS, ...SINONIMOS_NOVOS_PENDENTE_VALIDACAO },
  SINONIMOS_VALIDADOS,
  SINONIMOS_NOVOS_PENDENTE_VALIDACAO,
  CNAES_POR_TERMO,
  CNAES_EXCLUIDOS_POR_TERMO,
  ehPalavraAmbigua,
};
