-- ============================================================================
-- Migration 0008 — Pagamento com cartão via Mercado Pago (história 2.7)
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
--
-- Contexto: a migration 0004 (confirmar_compra, história 2.5) já previa isso
-- no próprio comentário — "webhook automático de gateway fica para uma
-- história futura". Esta é essa história. O modelo de `purchases` não muda de
-- forma: continua sendo pacote de créditos comprado avulso, com status
-- pendente → pago. O que entra é (a) por qual meio a compra foi paga e
-- (b) o identificador do pagamento no gateway, pra rastrear e conciliar.
--
-- Por que uma função NOVA em vez de reusar confirmar_compra():
--   confirmar_compra() levanta exceção se a compra não estiver 'pendente'.
--   Isso é correto pro clique manual de um admin (avisa que já foi paga), mas
--   é errado pra webhook: o Mercado Pago REENVIA a mesma notificação várias
--   vezes até receber 200, e é normal a segunda chegar depois da primeira já
--   ter processado. Com exceção, o webhook responderia 500 e o MP reenviaria
--   pra sempre. Aqui, compra já paga devolve 'ja_processada' sem erro.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Colunas novas em purchases
-- ────────────────────────────────────────────────────────────────────────────
alter table public.purchases
  add column if not exists metodo text not null default 'pix_manual',
  add column if not exists gateway_pagamento_id text;

-- Constraint separada do ADD COLUMN pra migration ser reaplicável sem erro.
alter table public.purchases drop constraint if exists purchases_metodo_check;
alter table public.purchases add constraint purchases_metodo_check
  check (metodo in ('pix_manual', 'mercadopago'));

-- Um pagamento do gateway nunca pode creditar duas compras diferentes. É a
-- trava de banco contra pagamento reaproveitado — não confiar só na checagem
-- feita no código, que roda fora de transação.
create unique index if not exists idx_purchases_gateway_pagamento
  on public.purchases (gateway_pagamento_id)
  where gateway_pagamento_id is not null;

comment on column public.purchases.metodo is
  'Como a compra foi/será paga: pix_manual (admin confirma na fila, história 6.3) ou mercadopago (webhook confirma sozinho, história 2.7).';
comment on column public.purchases.gateway_pagamento_id is
  'ID do pagamento no gateway (payment.id do Mercado Pago). Nulo em compras Pix manuais.';

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Confirmação vinda de webhook — idempotente e com conferência de valor
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.confirmar_compra_gateway(
  p_purchase_id          uuid,
  p_gateway_pagamento_id text,
  p_valor_centavos       integer
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra record;
begin
  -- FOR UPDATE serializa notificações concorrentes do mesmo pagamento: o MP
  -- pode disparar duas quase simultâneas, e sem o lock as duas passariam pela
  -- checagem de status antes de qualquer uma gravar, creditando em dobro.
  select * into v_compra from public.purchases where id = p_purchase_id for update;

  if not found then
    raise exception 'compra % não encontrada', p_purchase_id;
  end if;

  -- Idempotência: reenvio da mesma notificação não é erro, é o esperado.
  if v_compra.status = 'pago' then
    return 'ja_processada';
  end if;

  if v_compra.status <> 'pendente' then
    -- Expirada ou cancelada: não credita. Devolve sem exceção pro webhook
    -- responder 200 e o MP parar de reenviar — o caso já está decidido, e
    -- reenviar não vai mudar nada. Fica registrado no log da aplicação.
    return 'nao_pendente';
  end if;

  -- Anti-adulteração: o valor efetivamente pago tem que bater com o cobrado.
  -- Sem isso, alguém que conseguisse forjar uma notificação (ou pagar um
  -- valor menor num link manipulado) receberia o pacote inteiro.
  if p_valor_centavos is distinct from v_compra.valor_centavos then
    raise exception 'valor pago (%) difere do valor da compra (%)',
      p_valor_centavos, v_compra.valor_centavos;
  end if;

  update public.purchases
     set status               = 'pago',
         pago_em              = now(),
         gateway_pagamento_id = p_gateway_pagamento_id
   where id = p_purchase_id;

  insert into public.credit_ledger (user_id, delta, motivo, referencia_tipo, referencia_id)
  values (v_compra.user_id, v_compra.creditos, 'compra', 'purchase', p_purchase_id::text);

  return 'confirmada';
end;
$$;

-- Revogação explícita de `anon` — a lição da migration 0007 (ver CONTEXTO.md
-- seção 23): o Supabase concede EXECUTE a anon/authenticated por padrão em
-- toda function nova do schema public, e revogar de PUBLIC não remove o grant
-- que o anon tem por conta própria. Esta função credita saldo; deixá-la
-- exposta ao anon seria o mesmo bug de novo, com o mesmo impacto.
revoke execute on function public.confirmar_compra_gateway(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.confirmar_compra_gateway(uuid, text, integer)
  to service_role;
