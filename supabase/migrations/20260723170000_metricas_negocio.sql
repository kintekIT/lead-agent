-- ============================================================================
-- Migration 0006 — Métricas do negócio (história 6.4)
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
-- ============================================================================

-- Uma função só, devolvendo um jsonb com tudo que o painel precisa — evita
-- 5 idas e voltas separadas do backend pro Postgres a cada carregamento do
-- painel. `p_dias` é a janela pras séries diárias/somas (padrão 30); a
-- conversão trial→compra é sempre vitalícia (não faz sentido "zerar" toda
-- janela — é uma taxa por coorte, não um contador do período).
create or replace function public.metricas_negocio(p_dias integer default 30)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'periodoDias', p_dias,

    'novosUsuariosPorDia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', total) order by dia), '[]'::jsonb)
      from (
        select date_trunc('day', criado_em)::date as dia, count(*) as total
        from public.profiles
        where criado_em >= now() - (p_dias || ' days')::interval
        group by 1
      ) t
    ),

    'buscasPorDia', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', dia, 'total', total) order by dia), '[]'::jsonb)
      from (
        select date_trunc('day', criado_em)::date as dia, count(*) as total
        from public.searches
        where criado_em >= now() - (p_dias || ' days')::interval
        group by 1
      ) t
    ),

    'creditosVendidos', (
      select coalesce(sum(delta), 0)::integer
      from public.credit_ledger
      where motivo = 'compra' and criado_em >= now() - (p_dias || ' days')::interval
    ),

    'creditosConsumidos', (
      select coalesce(sum(-delta), 0)::integer
      from public.credit_ledger
      where motivo = 'consumo' and criado_em >= now() - (p_dias || ' days')::interval
    ),

    'nichosMaisBuscados', (
      select coalesce(jsonb_agg(jsonb_build_object('nicho', nicho, 'total', total) order by total desc), '[]'::jsonb)
      from (
        select nicho, count(*) as total
        from public.searches
        where criado_em >= now() - (p_dias || ' days')::interval
        group by nicho
        order by total desc
        limit 10
      ) t
    ),

    -- Vitalício, de propósito (ver comentário acima da função).
    'trialParaCompra', (
      select jsonb_build_object('trial', count(*), 'converteram', count(*) filter (where convertido))
      from (
        select tu.user_id,
               exists (
                 select 1 from public.credit_ledger c
                 where c.user_id = tu.user_id and c.motivo = 'compra'
               ) as convertido
        from (select distinct user_id from public.credit_ledger where motivo = 'trial') tu
      ) x
    )
  );
$$;

-- Só o backend (service_role), chamado a partir de uma rota protegida por
-- exigirAdmin — mesmo padrão de todas as outras funções deste projeto.
revoke execute on function public.metricas_negocio(integer) from public, authenticated;
grant  execute on function public.metricas_negocio(integer) to service_role;
