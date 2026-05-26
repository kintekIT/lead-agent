require('dotenv').config();
const readline = require('readline');
const { executarAgente } = require('./agent');

// Verifica se a chave da API está configurada
if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sua_chave_aqui') {
  console.error('\n❌ ERRO: Chave da API não configurada!');
  console.error('   Abra o arquivo .env e cole sua chave do Claude onde está escrito "sua_chave_aqui"');
  console.error('   Obtenha sua chave em: https://console.anthropic.com/\n');
  process.exit(1);
}

// Interface para leitura de texto digitado pelo usuário no terminal
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Função auxiliar para fazer perguntas e esperar a resposta
function perguntar(texto) {
  return new Promise(resolve => rl.question(texto, resolve));
}

// Função principal do programa
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     🤖 AGENTE DE GERAÇÃO DE LEADS      ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    const nicho = await perguntar('📌 Qual o nicho? (ex: clínica veterinária, escola, dentista): ');

    if (!nicho.trim()) {
      console.log('❌ O nicho não pode estar vazio.');
      rl.close();
      return;
    }

    const regiao = await perguntar('📍 Qual a região? (ex: São Paulo SP, Rio de Janeiro RJ, Curitiba PR): ');

    if (!regiao.trim()) {
      console.log('❌ A região não pode estar vazia.');
      rl.close();
      return;
    }

    const quantidadeTexto = await perguntar('🔢 Quantos leads deseja? (ex: 10): ');
    const quantidade = parseInt(quantidadeTexto, 10);

    if (isNaN(quantidade) || quantidade < 1) {
      console.log('❌ Digite um número válido de leads.');
      rl.close();
      return;
    }

    rl.close();

    // Inicia o agente com os dados fornecidos
    await executarAgente(nicho.trim(), regiao.trim(), quantidade);

  } catch (erro) {
    console.error('\n❌ Erro inesperado:', erro.message);
    if (erro.status === 401) {
      console.error('   Verifique se sua ANTHROPIC_API_KEY no arquivo .env está correta.');
    }
    rl.close();
    process.exit(1);
  }
}

main();
