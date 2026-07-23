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
  -- "as u(cnpj)" (em vez de só "as cnpj") é obrigatório aqui: delivered_leads
  -- também tem uma coluna chamada cnpj, e um alias de coluna sem tabela some
  -- por trás da coluna de mesmo nome da tabela interna (dl.cnpj) na
  -- resolução de nomes do Postgres — sem u., "cnpj" vira dl.cnpj = dl.cnpj
  -- (sempre verdadeiro) em vez de comparar com o cnpj de fora, e a função
  -- sempre devolve 0. Confirmado rodando contra o banco real.
  select count(*)::integer
  from unnest(p_cnpjs) as u(cnpj)
  where not exists (
    select 1 from public.delivered_leads dl
    where dl.user_id = p_user_id
      and dl.cnpj = u.cnpj
      and dl.delivered_at > now() - (p_janela_meses || ' months')::interval
  );
$$;

-- Só o backend (service_role, com o id do próprio usuário autenticado) chama
-- esta função — nunca diretamente pelo cliente.
revoke execute on function public.contar_novos(uuid, text[], integer) from public, authenticated;
grant  execute on function public.contar_novos(uuid, text[], integer) to service_role;
