// Trilha de auditoria de ações de negócio (história 5.4) — hoje cobre ações
// administrativas (ex.: confirmar uma compra Pix manualmente); qualquer nova
// rota do painel admin (Épico 6) deve chamar isso também.
const { supabaseAdmin } = require('./auth/supabase');
const { logger } = require('./utils/logger');

async function registrarEvento({ atorId, acao, alvoTipo = null, alvoId = null, metadados = {} }) {
  const { error } = await supabaseAdmin.from('events').insert({
    ator_id:   atorId,
    acao,
    alvo_tipo: alvoTipo,
    alvo_id:   alvoId != null ? String(alvoId) : null,
    metadados,
  });
  // Auditoria não pode derrubar a ação que está sendo auditada — só loga a falha.
  if (error) logger.error({ err: error, acao }, 'falha ao registrar evento de auditoria');
}

module.exports = { registrarEvento };
