// Integração com o Mercado Pago (história 2.7) — checkout de cartão para
// compra avulsa de pacote de créditos.
//
// Sem SDK de propósito: a API que a gente usa são três chamadas HTTP, e o
// `fetch` é nativo no Node 18+. Um SDK aqui adicionaria uma árvore de
// dependências pra manter e auditar em troca de quase nada — e o projeto já
// tem 6 vulnerabilidades conhecidas em dependências transitivas.
//
// Degradação graciosa, mesmo padrão do Pix e do Sentry: sem
// MERCADOPAGO_ACCESS_TOKEN no .env, `configurado()` devolve false e a rota
// responde 503 em vez de quebrar o servidor inteiro.

const crypto = require('node:crypto');

const API = 'https://api.mercadopago.com';

const ACCESS_TOKEN   = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';

function configurado() {
  return Boolean(ACCESS_TOKEN);
}

async function chamarApi(caminho, opcoes = {}) {
  const resposta = await fetch(`${API}${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opcoes.headers || {}),
    },
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    // A mensagem do MP vem em `message`; o resto do corpo costuma trazer
    // detalhe útil (campo inválido, etc). Sobe como Error pro chamador
    // decidir o que devolver ao usuário — nunca vazar isso cru pro cliente.
    const erro = new Error(corpo.message || `Mercado Pago respondeu ${resposta.status}`);
    erro.status = resposta.status;
    erro.detalhe = corpo;
    throw erro;
  }
  return corpo;
}

/**
 * Cria uma preferência de checkout e devolve a URL pra onde mandar o comprador.
 *
 * `external_reference` carrega o id da nossa compra. É por ele que o webhook
 * reencontra a compra depois — não guardamos o id da preferência, porque o
 * que o MP manda na notificação é o id do *pagamento*, que é outra coisa.
 */
async function criarPreferencia({ compraId, creditos, valorCentavos, emailComprador, urlBase }) {
  const pref = await chamarApi('/checkout/preferences', {
    method: 'POST',
    body: JSON.stringify({
      items: [{
        id: compraId,
        title: `${creditos} créditos — Leadoor`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: valorCentavos / 100,
      }],
      // Vincula o pagamento à nossa compra. Chega de volta na consulta do
      // pagamento, no webhook.
      external_reference: compraId,
      payer: emailComprador ? { email: emailComprador } : undefined,
      // Só cartão: o Pix deste projeto continua sendo o fluxo manual da 2.5
      // até alguém decidir migrá-lo pra cá (ver decisão em aberto no BACKLOG).
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }],
      },
      back_urls: {
        success: `${urlBase}/planos.html?compra=sucesso`,
        pending: `${urlBase}/planos.html?compra=pendente`,
        failure: `${urlBase}/planos.html?compra=falha`,
      },
      auto_return: 'approved',
      notification_url: `${urlBase}/webhooks/mercadopago`,
    }),
  });

  return { preferenciaId: pref.id, urlCheckout: pref.init_point };
}

/**
 * Consulta um pagamento pelo id. É a fonte de verdade sobre status e valor —
 * o corpo da notificação do webhook NUNCA é confiado, porque quem descobrir a
 * URL pública do webhook pode postar o que quiser nela.
 */
async function consultarPagamento(pagamentoId) {
  const p = await chamarApi(`/v1/payments/${encodeURIComponent(pagamentoId)}`);
  return {
    id: String(p.id),
    status: p.status,                       // approved | pending | rejected | ...
    compraId: p.external_reference || null, // o id da nossa purchase
    // transaction_amount vem em reais como número (99.9). Math.round evita o
    // clássico 99.9 * 100 = 9989.999999999998 do ponto flutuante, que faria a
    // conferência de valor falhar em compra legítima.
    valorCentavos: p.transaction_amount == null
      ? null
      : Math.round(p.transaction_amount * 100),
  };
}

/**
 * Valida a assinatura da notificação (header `x-signature`).
 *
 * O MP monta um "manifesto" com o id do recurso, o x-request-id e o timestamp,
 * e assina com HMAC-SHA256 usando um segredo que a gente cadastra no painel
 * dele. Sem essa checagem, a rota do webhook é um endpoint público que credita
 * saldo — qualquer um que descobrisse a URL poderia se dar créditos de graça.
 *
 * Devolve false (nunca lança) pra rota poder responder 401 sem cair no handler
 * de erro global.
 */
function validarAssinatura({ dataId, xSignature, xRequestId }) {
  if (!WEBHOOK_SECRET) return false;
  if (!xSignature || !dataId) return false;

  // Formato: "ts=1704908010,v1=618c85..."
  const partes = Object.fromEntries(
    String(xSignature)
      .split(',')
      .map((p) => p.split('=').map((s) => s.trim()))
      .filter((p) => p.length === 2),
  );
  const ts = partes.ts;
  const assinaturaRecebida = partes.v1;
  if (!ts || !assinaturaRecebida) return false;

  // O MP normaliza o id pra minúsculas quando ele é alfanumérico.
  const id = String(dataId).toLowerCase();
  const manifesto = `id:${id};request-id:${xRequestId || ''};ts:${ts};`;

  const esperada = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(manifesto)
    .digest('hex');

  // timingSafeEqual em vez de === : comparação de string sai cedo no primeiro
  // byte diferente, e o tempo de resposta vazaria a assinatura correta byte a
  // byte pra quem medisse. Exige buffers do mesmo tamanho.
  const a = Buffer.from(esperada, 'utf8');
  const b = Buffer.from(assinaturaRecebida, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = {
  configurado,
  criarPreferencia,
  consultarPagamento,
  validarAssinatura,
};
