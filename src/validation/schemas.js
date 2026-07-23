// Schemas de validação de entrada (história 4.2). Mantidos separados das
// rotas para poderem ser testados sem precisar subir o servidor Express.

const { z } = require('zod');

const iniciarBodySchema = z.object({
  nicho: z.string().trim().min(2, 'Nicho deve ter ao menos 2 caracteres.').max(100),
  regiao: z.string().trim().min(2, 'Região deve ter ao menos 2 caracteres.').max(100),
  quantidade: z.coerce.number({ message: 'Quantidade deve ser um número.' })
    .int('Quantidade deve ser um número inteiro.')
    .min(1, 'Quantidade deve ser no mínimo 1.')
    .max(1000, 'Quantidade deve ser no máximo 1000.'),
  modo: z.enum(['agente', 'rpa', 'receita'], { message: 'Modo deve ser agente, rpa ou receita.' })
    .default('agente'),
});

// Prévia (história 2.4): mesmos campos de busca, sem `modo` — só o motor
// Receita Federal tem prévia, pois só ele tem CNPJ pra deduplicar.
const previaBodySchema = z.object({
  nicho: z.string().trim().min(2, 'Nicho deve ter ao menos 2 caracteres.').max(100),
  regiao: z.string().trim().min(2, 'Região deve ter ao menos 2 caracteres.').max(100),
  quantidade: z.coerce.number({ message: 'Quantidade deve ser um número.' })
    .int('Quantidade deve ser um número inteiro.')
    .min(1, 'Quantidade deve ser no mínimo 1.')
    .max(1000, 'Quantidade deve ser no máximo 1000.'),
});

// Formato gerado em server.js: `s_${Date.now()}_${random}`
const sessionIdParamSchema = z.object({
  id: z.string().regex(/^s_\d+_[a-z0-9]+$/, 'Identificador de sessão inválido.'),
});

// Painel admin (história 6.1) — busca por email + paginação da listagem de contas
const adminListQuerySchema = z.object({
  busca:  z.string().trim().max(200).optional(),
  pagina: z.coerce.number({ message: 'Página deve ser um número.' }).int().min(1).default(1),
});

// uuid gerado pelo auth.users do Supabase
const adminUsuarioIdParamSchema = z.object({
  id: z.string().uuid('Identificador de usuário inválido.'),
});

const adminPapelBodySchema = z.object({
  role: z.enum(['user', 'admin'], { message: 'Papel deve ser user ou admin.' }),
});

module.exports = {
  iniciarBodySchema,
  previaBodySchema,
  sessionIdParamSchema,
  adminListQuerySchema,
  adminUsuarioIdParamSchema,
  adminPapelBodySchema,
};
