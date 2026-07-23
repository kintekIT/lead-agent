const { buscarLeadsReceita, formatarEndereco } = require('./tools/receita');
const { criarGerenciadorLeads }                = require('./tools/leads');

// `quantidadeBusca` é o tamanho do pool pedido ao banco — pode ser maior que
// o que o usuário efetivamente vai receber, para sobrar candidatos depois do
// dedup (história 3.1). `aplicarCota`, se passado, recebe o pool bruto e
// devolve só os leads que realmente serão entregues/cobrados (história 2.3);
// sem ele, todo o pool é entregue (comportamento antigo, sem crédito/dedup).
async function executarReceita(nicho, regiao, quantidadeBusca, onEvento = null, aplicarCota = null) {
  const emit = (tipo, dados) => { if (onEvento) onEvento(tipo, dados); };

  console.log(`\n🗂️  Iniciando motor Receita Federal — Nicho: ${nicho} | Região: ${regiao} | Qtd: ${quantidadeBusca}\n`);
  emit('inicio', { nicho, regiao, quantidade: quantidadeBusca });
  emit('log', { mensagem: 'Consultando base de dados da Receita Federal...' });

  const resultado = buscarLeadsReceita(nicho, regiao, quantidadeBusca);

  if (!resultado.sucesso) {
    emit('log', { mensagem: resultado.mensagem });
    return { sucesso: false, mensagem: resultado.mensagem };
  }

  const { cnaesUsados, avisos } = resultado;
  let leads = resultado.leads;
  emit('log', { mensagem: `${leads.length} estabelecimento(s) encontrado(s) — ${cnaesUsados} CNAE(s) mapeado(s)` });
  for (const aviso of avisos || []) emit('log', { mensagem: `⚠️ ${aviso}` });

  if (aplicarCota) {
    leads = await aplicarCota(leads);
    emit('log', { mensagem: `${leads.length} lead(s) novo(s) — dentro do saldo e ainda não entregues nos últimos 6 meses` });
  }

  const { salvarLead, finalizarLeads } = criarGerenciadorLeads();

  for (const e of leads) {
    const r = await salvarLead({
      nome_empresa:  e.nome_fantasia || e.razao_social || 'N/A',
      nome_contato:  e.razao_social  || null,
      email:         e.email,
      telefone:      e.telefone,
      dominio:       null,
      tipo_registro: 'CNPJ',
      cpf_cnpj:      e.cnpj,
      atividade:     e.atividade || null,
      cidade:        e.municipio || null,
      endereco:      formatarEndereco(e) || null,
    });

    if (r.sucesso) {
      const lead = r.lead;
      console.log(`✅ Lead #${r.totalLeads}: ${lead.nomeEmpresa}`);
      emit('lead_salvo', {
        numero:       r.totalLeads,
        nomeEmpresa:  lead.nomeEmpresa,
        nomeContato:  lead.nomeContato,
        email:        lead.email,
        telefone:     lead.telefone,
        dominio:      null,
        tipoRegistro: 'CNPJ',
        cpfCnpj:      lead.cpfCnpj,
        atividade:    lead.atividade,
        cidade:       lead.cidade,
        endereco:     lead.endereco,
      });
    }
  }

  console.log('\n📊 Gerando planilha...');
  emit('gerando_excel', {});

  const final = await finalizarLeads(nicho, regiao);

  if (final.sucesso) {
    console.log(`\n✅ Concluído! ${final.totalLeads} leads → ${final.arquivo}`);
  } else {
    console.log(`\n⚠️  ${final.mensagem}`);
  }

  return final;
}

module.exports = { executarReceita };
