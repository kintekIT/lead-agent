// Ao buscar no receita.db para o motor Receita Federal, pedimos mais leads do
// que o usuário quer: parte do pool já pode ter sido entregue a ele nos
// últimos 6 meses (histórias 2.3/2.4/3.1) e precisa ser descartada. Sem esse
// excesso, repetir a mesma busca traria poucos ou nenhum lead novo.
const FATOR_POOL  = 3;
const POOL_MAXIMO = 3000;

function tamanhoPool(quantidade) {
  return Math.min(quantidade * FATOR_POOL, POOL_MAXIMO);
}

module.exports = { tamanhoPool };
