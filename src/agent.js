const Anthropic = require('@anthropic-ai/sdk');
const { consultarWhois } = require('./tools/whois');
const { consultarCnpj }  = require('./tools/cnpj');
const { criarGerenciadorLeads } = require('./tools/leads');

const client = new Anthropic();

const ferramentasCliente = [
  {
    name: 'consultar_whois',
    description: 'Consulta o WHOIS de um domínio no registro.br para descobrir se é registrado por CPF ou CNPJ e obter dados de contato do proprietário.',
    input_schema: {
      type: 'object',
      properties: {
        dominio: { type: 'string', description: 'Domínio a consultar (ex: clinica.com.br). Sem http:// ou www.' }
      },
      required: ['dominio']
    }
  },
  {
    name: 'consultar_cnpj',
    description: 'Consulta dados completos de uma empresa pelo CNPJ via cnpj.ws (CNPJBIZ). Retorna razão social, email, telefone e sócios.',
    input_schema: {
      type: 'object',
      properties: {
        cnpj: { type: 'string', description: 'CNPJ da empresa (pode conter pontos, barra e traço).' }
      },
      required: ['cnpj']
    }
  },
  {
    name: 'salvar_lead',
    description: 'Salva um lead qualificado. Chame somente após ter o máximo de dados disponíveis.',
    input_schema: {
      type: 'object',
      properties: {
        nome_empresa:  { type: 'string', description: 'Nome da empresa ou razão social' },
        nome_contato:  { type: 'string', description: 'Nome do responsável ou sócio' },
        email:         { type: 'string', description: 'Email de contato' },
        telefone:      { type: 'string', description: 'Telefone com DDD' },
        dominio:       { type: 'string', description: 'Domínio do site da empresa' },
        tipo_registro: { type: 'string', enum: ['CPF', 'CNPJ'], description: 'Tipo de registro no WHOIS' },
        cpf_cnpj:      { type: 'string', description: 'Número do CPF ou CNPJ obtido no WHOIS (ex: 12.345.678/0001-90 ou ***.456.789-**)' }
      },
      required: ['nome_empresa', 'tipo_registro']
    }
  }
];

async function executarAgente(nicho, regiao, quantidade, onEvento = null) {
  const emit = (tipo, dados) => { if (onEvento) onEvento(tipo, dados); };

  const { salvarLead, finalizarLeads } = criarGerenciadorLeads();

  console.log(`\n🤖 Iniciando agente — Nicho: ${nicho} | Região: ${regiao} | Qtd: ${quantidade}\n`);
  emit('inicio', { nicho, regiao, quantidade });

  // Cache local por execução — impede consultas duplicadas e guarda número CPF/CNPJ por domínio
  const cacheWhois   = new Map();
  const cacheCnpj    = new Map();
  const cacheCpfCnpj = new Map(); // dominio → número CPF ou CNPJ

  const executarFerramenta = async (nome, entrada) => {
    switch (nome) {
      case 'consultar_whois': {
        const chave = entrada.dominio?.toLowerCase().replace(/^www\./, '');
        if (cacheWhois.has(chave)) {
          console.log(`\n♻️  WHOIS (cache) → ${chave}`);
          return cacheWhois.get(chave);
        }
        console.log(`\n🔧 WHOIS → ${chave}`);
        emit('ferramenta', { nome, dominio: chave });
        const res = await consultarWhois(entrada.dominio);
        cacheWhois.set(chave, res);
        // Guarda o número CPF/CNPJ para injeção automática no salvar_lead
        if (res.sucesso) {
          cacheCpfCnpj.set(chave, res.cnpj || res.cpf || null);
        }
        return res;
      }
      case 'consultar_cnpj': {
        const cnpjLimpo = entrada.cnpj?.replace(/[.\-\/]/g, '').trim();
        if (cacheCnpj.has(cnpjLimpo)) {
          console.log(`\n♻️  CNPJ (cache) → ${cnpjLimpo}`);
          return cacheCnpj.get(cnpjLimpo);
        }
        console.log(`\n🔧 CNPJ  → ${cnpjLimpo}`);
        emit('ferramenta', { nome, cnpj: cnpjLimpo });
        const res = await consultarCnpj(entrada.cnpj);
        cacheCnpj.set(cnpjLimpo, res);
        return res;
      }
      case 'salvar_lead': {
        // Injeta CPF/CNPJ automaticamente do cache do WHOIS — não depende do agente passar o campo
        if (!entrada.cpf_cnpj && entrada.dominio) {
          const chave = entrada.dominio.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
          entrada.cpf_cnpj = cacheCpfCnpj.get(chave) || null;
        }
        const resultado = await salvarLead(entrada);
        if (resultado.sucesso) {
          const lead = resultado.lead;
          const num  = resultado.totalLeads;
          console.log(`\n✅ Lead #${num}: ${lead.nomeEmpresa}`);
          emit('lead_salvo', {
            numero:       num,
            nomeEmpresa:  lead.nomeEmpresa,
            nomeContato:  lead.nomeContato,
            email:        lead.email,
            telefone:     lead.telefone,
            dominio:      lead.dominio,
            tipoRegistro: lead.tipoRegistro,
            cpfCnpj:      lead.cpfCnpj
          });
        }
        return resultado;
      }
      default:
        return { erro: `Ferramenta desconhecida: ${nome}` };
    }
  };

  const promptSistema = `Você é um agente especializado em geração de leads B2B no Brasil.

Sua missão: encontrar ${quantidade} leads qualificados de "${nicho}" em "${regiao}".

FLUXO OBRIGATÓRIO para cada empresa encontrada:
1. Use a busca web para encontrar empresas do nicho na região (busque sites .com.br)
2. Para cada empresa encontrada, extraia o domínio do site
3. Use "consultar_whois" no domínio para descobrir o proprietário:
   - Se for CNPJ: use "consultar_cnpj" com o CNPJ encontrado para obter dados completos
   - Se for CPF com dados mascarados pela LGPD: tente buscar email e telefone no próprio site da empresa
4. Use "salvar_lead" somente após ter o máximo de dados disponíveis
5. Continue até atingir ${quantidade} leads ou esgotar os resultados

REGRAS IMPORTANTES:
- Quando o WHOIS retornar CNPJ, SEMPRE consulte o CNPJ antes de salvar o lead
- Para CPF com LGPD: faça pelo menos UMA busca adicional para tentar recuperar email/telefone
- Priorize empresas ativas e com sites funcionais
- Não salve duplicatas do mesmo domínio
- Processe uma empresa por vez até ter os dados completos
- Salve o lead mesmo quando email ou telefone não forem encontrados`;

  const mensagens = [{
    role: 'user',
    content: `Preciso de ${quantidade} leads de "${nicho}" em "${regiao}". Comece a busca agora.`
  }];

  let containerId = null;

  const chamarApi = (msgs) => {
    const params = {
      model:   'claude-opus-4-7',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system:  promptSistema,
      tools:   [...ferramentasCliente, { type: 'web_search_20250305', name: 'web_search' }],
      messages: msgs
    };
    if (containerId) params.container_id = containerId;
    return client.messages.create(params);
  };

  let resposta = await chamarApi(mensagens);
  if (resposta.container_id) containerId = resposta.container_id;

  while (resposta.stop_reason === 'tool_use' || resposta.stop_reason === 'pause_turn') {

    if (resposta.stop_reason === 'pause_turn') {
      mensagens.push({ role: 'assistant', content: resposta.content });
      resposta = await chamarApi(mensagens);
      if (resposta.container_id) containerId = resposta.container_id;
      continue;
    }

    const blocos = resposta.content.filter(b => b.type === 'tool_use');
    mensagens.push({ role: 'assistant', content: resposta.content });

    const resultados = [];
    for (const bloco of blocos) {
      const resultado = await executarFerramenta(bloco.name, bloco.input);
      resultados.push({ type: 'tool_result', tool_use_id: bloco.id, content: JSON.stringify(resultado) });
    }

    mensagens.push({ role: 'user', content: resultados });
    resposta = await chamarApi(mensagens);
    if (resposta.container_id) containerId = resposta.container_id;
  }

  const textoFinal = resposta.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
  if (textoFinal) {
    console.log('\n📋 Resumo:', textoFinal);
    emit('log', { mensagem: textoFinal.substring(0, 200) });
  }

  console.log('\n📊 Gerando planilha...');
  emit('gerando_excel', {});

  const resultado = await finalizarLeads(nicho, regiao);

  if (resultado.sucesso) {
    console.log(`\n✅ Concluído! ${resultado.totalLeads} leads → ${resultado.arquivo}`);
  } else {
    console.log(`\n⚠️  ${resultado.mensagem}`);
  }

  return resultado;
}

module.exports = { executarAgente };
