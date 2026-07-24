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

// Compra de créditos via Pix (história 2.5)
const compraBodySchema = z.object({
  pacote: z.enum(['200', '500', '1000'], { message: 'Pacote inválido.' }),
});

const compraIdParamSchema = z.object({
  id: z.string().uuid('Identificador de compra inválido.'),
});

// Re-download do Excel de uma busca já concluída (história 3.2) — id da tabela searches
const buscaIdParamSchema = z.object({
  id: z.string().uuid('Identificador de busca inválido.'),
});

// Créditos manuais (história 6.2) — delta != 0 (positivo credita, negativo
// estorna); limite alto só pra pegar erro de digitação grosseiro (ex.: um
// zero a mais), a validação de saldo insuficiente pra estornar é do banco.
const adminCreditosBodySchema = z.object({
  delta: z.coerce.number({ message: 'Quantidade deve ser um número.' })
    .int('Quantidade deve ser um número inteiro.')
    .refine(v => v !== 0, 'Quantidade não pode ser zero.')
    .refine(v => Math.abs(v) <= 100000, 'Quantidade fora do intervalo permitido (máx. 100000).'),
  motivo: z.string().trim().min(5, 'Motivo deve ter ao menos 5 caracteres.').max(300),
});

// Métricas do negócio (história 6.4) — janela em dias pras séries/somas
const adminMetricasQuerySchema = z.object({
  dias: z.coerce.number({ message: 'Dias deve ser um número.' }).int().min(1).max(365).default(30),
});

module.exports = {
  iniciarBodySchema,
  previaBodySchema,
  sessionIdParamSchema,
  adminListQuerySchema,
  adminUsuarioIdParamSchema,
  adminPapelBodySchema,
  compraBodySchema,
  compraIdParamSchema,
  buscaIdParamSchema,
  adminCreditosBodySchema,
  adminMetricasQuerySchema,
};
