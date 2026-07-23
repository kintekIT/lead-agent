-- ============================================================================
-- Migration 0002 — Débito atômico por lead entregue + dedup de 6 meses
-- (histórias 2.3 e 3.1)
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
--
-- Fluxo: o backend busca um "pool" de candidatos no receita.db (mais do que
-- o usuário pediu, para sobrar depois do dedup), e chama entregar_leads()
-- passando os CNPJs do pool. A função filtra os já entregues nos últimos
-- N meses, corta pelo saldo disponível e pela quantidade pedida, grava tudo
-- atomicamente (delivered_leads + credit_ledger + searches) e devolve só os
-- CNPJs aceitos — só esses viram lead na resposta/planilha.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- Backstop: mesmo se algum caminho novo esquecer a trava de concorrência
-- (ver entregar_leads), o banco nunca deixa o saldo de um usuário ficar
-- negativo (aceite da história 2.3).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.impedir_saldo_negativo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.saldo_creditos(new.user_id) < 0 then
    raise exception 'saldo insuficiente: operação deixaria o saldo do usuário % negativo', new.user_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create constraint trigger trg_impedir_saldo_negativo
  after insert on public.credit_ledger
  for each row execute function public.impedir_saldo_negativo();

-- ────────────────────────────────────────────────────────────────────────────
-- entregar_leads() — débito atômico + dedup (histórias 2.3 e 3.1).
-- Recebe um pool de candidatos, devolve só os aceitos (novos, dentro do
-- saldo e da quantidade pedida) e já deixa tudo gravado: delivered_leads,
-- credit_ledger (consumo) e searches (fechamento).
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.entregar_leads(
  p_user_id      uuid,
  p_search_id    uuid,
  p_cnpjs        text[],
  p_limite       integer,
  p_janela_meses integer default 6
)
returns text[]
language plpgsql
set search_path = public
as $$
declare
  v_saldo   integer;
  v_novos   text[];
  v_aceitos text[];
  v_qtd     integer;
begin
  -- Serializa chamadas concorrentes para o MESMO usuário: sem isso, 2 buscas
  -- simultâneas poderiam ambas ler o mesmo saldo "antigo" e juntas
  -- ultrapassá-lo. O advisory lock é por transação (libera sozinho no
  -- commit/rollback) — buscas de usuários diferentes continuam paralelas.
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- "with ordinality" + order by preserva a ordem original de p_cnpjs: o pool
  -- que o backend manda já vem intercalado entre CNAEs (ver receita.js), e
  -- cortar v_novos[1:v_qtd] sem isso quebraria essa distribuição.
  select coalesce(array_agg(t.cnpj order by t.ord), '{}')
    into v_novos
  from unnest(p_cnpjs) with ordinality as t(cnpj, ord)
  where not exists (
    select 1 from public.delivered_leads dl
    where dl.user_id = p_user_id
      and dl.cnpj = t.cnpj
      and dl.delivered_at > now() - (p_janela_meses || ' months')::interval
  );

  v_saldo := coalesce(public.saldo_creditos(p_user_id), 0);
  v_qtd   := least(coalesce(array_length(v_novos, 1), 0), greatest(p_limite, 0), greatest(v_saldo, 0));

  if v_qtd > 0 then
    v_aceitos := v_novos[1:v_qtd];

    insert into public.delivered_leads (user_id, cnpj, search_id)
    select p_user_id, cnpj, p_search_id from unnest(v_aceitos) as cnpj;

    insert into public.credit_ledger (user_id, delta, motivo, referencia_tipo, referencia_id)
    values (p_user_id, -v_qtd, 'consumo', 'search', p_search_id::text);
  else
    v_aceitos := '{}';
  end if;

  update public.searches
     set qtd_entregue   = v_qtd,
         custo_creditos = v_qtd,
         status         = 'concluida'
   where id = p_search_id;

  return v_aceitos;
end;
$$;

-- Só o backend (service_role, com o id do próprio usuário autenticado) chama
-- esta função — nunca diretamente pelo cliente.
revoke execute on function public.entregar_leads(uuid, uuid, text[], integer, integer) from public, authenticated;
grant  execute on function public.entregar_leads(uuid, uuid, text[], integer, integer) to service_role;
