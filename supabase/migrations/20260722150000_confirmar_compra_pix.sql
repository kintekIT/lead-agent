-- ============================================================================
-- Migration 0004 — Confirmação de compra Pix (história 2.5, etapa 1: admin
-- confirma manualmente o pagamento recebido; webhook automático de gateway
-- fica para uma história futura, como o próprio backlog já prevê).
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
-- ============================================================================

create or replace function public.confirmar_compra(p_purchase_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_compra record;
begin
  select * into v_compra from public.purchases where id = p_purchase_id for update;

  if not found then
    raise exception 'compra % não encontrada', p_purchase_id;
  end if;
  if v_compra.status <> 'pendente' then
    raise exception 'compra % não está pendente (status atual: %)', p_purchase_id, v_compra.status;
  end if;

  update public.purchases
     set status = 'pago', pago_em = now()
   where id = p_purchase_id;

  insert into public.credit_ledger (user_id, delta, motivo, referencia_tipo, referencia_id)
  values (v_compra.user_id, v_compra.creditos, 'compra', 'purchase', p_purchase_id::text);
end;
$$;

-- Só o backend (service_role), chamado a partir de uma rota protegida por
-- exigirAdmin — nunca diretamente pelo cliente autenticado comum.
revoke execute on function public.confirmar_compra(uuid) from public, authenticated;
grant  execute on function public.confirmar_compra(uuid) to service_role;
