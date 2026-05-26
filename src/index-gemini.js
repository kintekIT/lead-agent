require('dotenv').config();
const readline = require('readline');
const { executarAgente } = require('./agent-gemini');

if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'sua_chave_aqui') {
  console.error('\n❌ ERRO: Chave da API Gemini não configurada!');
  console.error('   Abra o arquivo .env e cole sua chave do Gemini onde está escrito "sua_chave_aqui"');
  console.error('   Obtenha sua chave GRATUITA em: https://aistudio.google.com/apikey\n');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function perguntar(texto) {
  return new Promise(resolve => rl.question(texto, resolve));
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   🤖 AGENTE DE LEADS — GEMINI (FREE)   ║');
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
    await executarAgente(nicho.trim(), regiao.trim(), quantidade);

  } catch (erro) {
    console.error('\n❌ Erro inesperado:', erro.message);
    if (erro.message?.includes('API_KEY') || erro.message?.includes('401')) {
      console.error('   Verifique se sua GEMINI_API_KEY no arquivo .env está correta.');
    }
    rl.close();
    process.exit(1);
  }
}

main();
