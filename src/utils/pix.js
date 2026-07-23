// Gera o payload "Pix Copia e Cola" (BR Code / EMV) — formato definido pelo
// Banco Central, o mesmo que qualquer QR de Pix estático usa. Referência:
// https://www.bcb.gov.br/estabilidadefinanceira/pix (Manual de Padrões para
// Iniciação do Pix). Determinístico, sem dependência externa.

function tlv(id, valor) {
  const tamanho = String(valor.length).padStart(2, '0');
  return `${id}${tamanho}${valor}`;
}

// Remove acentos e caracteres fora da faixa ASCII exigida pelo padrão EMV.
function limparAscii(str, tamanhoMax) {
  return String(str || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, tamanhoMax);
}

// CRC16/CCITT-FALSE (polinômio 0x1021, init 0xFFFF) — checksum exigido no
// campo final (ID 63) de todo payload EMV.
function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * @param {object} p
 * @param {string} p.chave  Chave Pix do recebedor (email, telefone, CPF/CNPJ ou aleatória)
 * @param {number} p.valor  Valor em reais (ex.: 99.90)
 * @param {string} p.nome   Nome do recebedor (máx. 25 caracteres, sem acento)
 * @param {string} p.cidade Cidade do recebedor (máx. 15 caracteres, sem acento)
 * @param {string} p.txid   Identificador da cobrança (só A-Z0-9, máx. 25 — aceita qualquer string e limpa sozinho)
 * @returns {string} payload "copia e cola" pronto para gerar QR ou colar num app de banco
 */
function gerarPayloadPix({ chave, valor, nome, cidade, txid }) {
  const contaPix = tlv('00', 'br.gov.bcb.pix') + tlv('01', chave);
  const txidLimpo = String(txid || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 25) || '***';

  const semCrc = [
    tlv('00', '01'),                       // Payload Format Indicator
    tlv('26', contaPix),                   // Merchant Account Information — Pix
    tlv('52', '0000'),                     // Merchant Category Code (não especificado)
    tlv('53', '986'),                      // Moeda: BRL
    tlv('54', Number(valor).toFixed(2)),    // Valor da cobrança
    tlv('58', 'BR'),                        // País
    tlv('59', limparAscii(nome, 25)   || 'LEAD AGENT'),
    tlv('60', limparAscii(cidade, 15) || 'SAO PAULO'),
    tlv('62', tlv('05', txidLimpo)),        // Additional Data Field — txid
  ].join('') + '6304';                      // abre o campo do CRC (ID 63, tamanho 04)

  return semCrc + crc16(semCrc);
}

module.exports = { gerarPayloadPix };
