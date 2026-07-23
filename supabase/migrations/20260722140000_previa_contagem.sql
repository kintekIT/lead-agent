-- ============================================================================
-- Migration 0003 — Prévia pré-consumo (história 2.4)
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`, depois da
-- 20260722130000_debito_atomico_dedup.sql (usa a mesma tabela delivered_leads).
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- contar_novos() — quantos dos CNPJs dados ainda NÃO foram entregues a este
-- usuário na janela de dedup. Só leitura, sem gravar nada e sem custo —
-- é a base do "Encontramos N leads novos para você" antes de confirmar.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.contar_novos(
  p_user_id      uuid,
  p_cnpjs        text[],
  p_janela_meses integer default 6
)
returns integer
language sql
stable
set search_path = public
as $$
  select count(*)::integer
  from unnest(p_cnpjs) as cnpj
  where not exists (
    select 1 from public.delivered_leads dl
    where dl.user_id = p_user_id
      and dl.cnpj = cnpj
      and dl.delivered_at > now() - (p_janela_meses || ' months')::interval
  );
$$;

-- Só o backend (service_role, com o id do próprio usuário autenticado) chama
-- esta função — nunca diretamente pelo cliente.
revoke execute on function public.contar_novos(uuid, text[], integer) from public, authenticated;
grant  execute on function public.contar_novos(uuid, text[], integer) to service_role;
