const { GoogleGenerativeAI } = require('@google/generative-ai');
const { consultarWhois } = require('./tools/whois');
const { consultarCnpj }  = require('./tools/cnpj');
const { criarGerenciadorLeads } = require('./tools/leads');

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const ferramentasGemini = [
  {
    name: 'consultar_whois',
    description: 'Consulta o WHOIS de um domínio no registro.br para descobrir se é registrado por CPF ou CNPJ e obter dados de contato do proprietário.',
    parameters: {
      type: 'object',
      properties: {
        dominio: { type: 'string', description: 'Domínio a consultar (ex: clinica.com.br). Sem http:// ou www.' }
      },
      required: ['dominio']
    }
  },
  {
    name: 'consultar_cnpj',
    description: 'Consulta dados completos de uma empresa pelo CNPJ via cnpj.ws. Retorna razão social, email, telefone e sócios.',
    parameters: {
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
    parameters: {
      type: 'object',
      properties: {
        nome_empresa:  { type: 'string', description: 'Nome da empresa ou razão social' },
        nome_contato:  { type: 'string', description: 'Nome do responsável ou sócio' },
        email:         { type: 'string', description: 'Email de contato' },
        telefone:      { type: 'string', description: 'Telefone com DDD' },
        dominio:       { type: 'string', description: 'Domínio do site da empresa' },
        tipo_registro: { type: 'string', description: 'Tipo de registro no WHOIS: CPF ou CNPJ' },
        cpf_cnpj:      { type: 'string', description: 'Número do CPF ou CNPJ obtido no WHOIS' }
      },
      required: ['nome_empresa', 'tipo_registro']
    }
  }
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function comRetry(fn, tentativas = 3, delayBase = 2000) {
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      const e503 = err?.message?.includes('503') || err?.status === 503;
      if (e503 && i < tentativas - 1) {
        const espera = delayBase * Math.pow(2, i);
        console.log(`\n⏳ Gemini 503 — aguardando ${espera / 1000}s antes de tentar novamente...`);
        await sleep(espera);
      } else {
        throw err;
      }
    }
  }
}

async function executarAgente(nicho, regiao, quantidade, onEvento = null) {
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const emit = (tipo, dados) => { if (onEvento) onEvento(tipo, dados); };
  const { salvarLead, finalizarLeads } = criarGerenciadorLeads();

  console.log(`\n🤖 [Gemini/${modelName}] Iniciando agente — Nicho: ${nicho} | Região: ${regiao} | Qtd: ${quantidade}\n`);
  emit('inicio', { nicho, regiao, quantidade });

  const cacheWhois   = new Map();
  const cacheCnpj    = new Map();
  const cacheCpfCnpj = new Map();

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
        if (!entrada.cpf_cnpj && entrada.dominio) {
          const chave = entrada.dominio.toLowerCase()
            .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
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

  // ── FASE 1: busca de empresas via Google Search ──────────────────────────
  console.log('🔍 Fase 1: buscando empresas...');
  const modelBusca = client.getGenerativeModel({
    model: modelName,
    tools: [{ googleSearch: {} }]
  });

  const buscaResposta = await comRetry(() => modelBusca.generateContent({
    contents: [{
      role: 'user',
      parts: [{ text: `Busque ${quantidade * 2} empresas de "${nicho}" em "${regiao}" no Brasil que tenham site próprio (.com.br ou .com). Responda SOMENTE com JSON válido no formato: {"empresas":[{"nome":"...","dominio":"..."}]}. Sem texto extra, apenas o JSON.` }]
    }]
  }));

  const buscaTexto = (buscaResposta.response.candidates?.[0]?.content?.parts || [])
    .filter(p => p.text).map(p => p.text).join('');

  let empresas = [];
  try {
    const jsonMatch = buscaTexto.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      empresas = JSON.parse(jsonMatch[0]).empresas || [];
    }
  } catch {
    const dominios = buscaTexto.match(/[\w.-]+\.(?:com\.br|com|org\.br|net\.br)/g) || [];
    empresas = [...new Set(dominios)].map(d => ({ nome: d, dominio: d }));
  }

  if (empresas.length === 0) {
    console.log('⚠️  Nenhuma empresa encontrada na busca.');
    emit('log', { mensagem: 'Nenhuma empresa encontrada na busca.' });
    return await finalizarLeads(nicho, regiao);
  }

  console.log(`✔️  ${empresas.length} empresas encontradas. Iniciando qualificação...\n`);

  // ── FASE 2: qualificação via WHOIS / CNPJ / salvar_lead ─────────────────
  const promptQualificacao = `Você é um agente de qualificação de leads B2B no Brasil.
Para a empresa fornecida, execute OBRIGATORIAMENTE:
1. "consultar_whois" no domínio informado
2. Se WHOIS retornar CNPJ: execute "consultar_cnpj" com esse CNPJ
3. Execute "salvar_lead" com todos os dados obtidos (mesmo sem email/telefone)`;

  const modelQualificacao = client.getGenerativeModel({
    model: modelName,
    systemInstruction: promptQualificacao,
    tools: [{ functionDeclarations: ferramentasGemini }]
  });

  const chamarQualificacao = (msgs) => comRetry(() => modelQualificacao.generateContent({ contents: msgs }));

  for (const empresa of empresas.slice(0, quantidade)) {
    const dominio = empresa.dominio?.toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];

    if (!dominio) continue;

    console.log(`\n🏢 Processando: ${empresa.nome} (${dominio})`);

    const mensagens = [{
      role: 'user',
      parts: [{ text: `Qualifique este lead — Nome: "${empresa.nome}", Domínio: "${dominio}"` }]
    }];

    if (empresas.indexOf(empresa) > 0) await sleep(1000);

    let resposta = await chamarQualificacao(mensagens);

    while (true) {
      const parts = resposta.response.candidates?.[0]?.content?.parts || [];
      const chamadas = parts.filter(p => p.functionCall);

      if (chamadas.length === 0) break;

      mensagens.push({ role: 'model', parts });

      const respostas = [];
      for (const parte of chamadas) {
        const resultado = await executarFerramenta(parte.functionCall.name, parte.functionCall.args);
        respostas.push({
          functionResponse: {
            name: parte.functionCall.name,
            response: { output: JSON.stringify(resultado) }
          }
        });
      }

      mensagens.push({ role: 'user', parts: respostas });
      resposta = await chamarQualificacao(mensagens);
    }
  }

  console.log('\n📊 Gerando planilha...');
  emit('gerando_excel', {});

  const resultado = await finalizarLeads(nicho, regiao);

  if (resultado.sucesso) {
    console.log(`\n✅ Concluído! ${resultado.totalLeads} leads → ${resultado.arquivo}`);
    emit('log', { mensagem: `${resultado.totalLeads} leads salvos.` });
  } else {
    console.log(`\n⚠️  ${resultado.mensagem}`);
  }

  return resultado;
}

module.exports = { executarAgente };
