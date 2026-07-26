-- ============================================================================
-- Migration 0007 — Revoga EXECUTE do role anon nas RPCs sensíveis
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
--
-- Achado via mcp__supabase__get_advisors (security): confirmar_compra,
-- conceder_trial e handle_new_user são SECURITY DEFINER e estavam
-- executáveis pelo role anon (sem login nenhum) via
-- POST /rest/v1/rpc/<função> com só a anon key pública.
--
-- Causa raiz: o Supabase concede EXECUTE a anon/authenticated por padrão em
-- toda function nova do schema public (ALTER DEFAULT PRIVILEGES do próprio
-- provisionamento do projeto). Todas as migrations anteriores só faziam
-- `revoke execute ... from public, authenticated` — nunca revogaram de
-- `anon` explicitamente. Revogar de PUBLIC (pseudo-role) não remove o grant
-- que o anon já tem por conta própria, então o acesso do anon nunca saiu.
--
-- Impacto real confirmado: confirmar_compra(uuid) é SECURITY DEFINER (roda
-- com privilégio elevado, ignora RLS) e credita credit_ledger — qualquer
-- requisição sem login, sabendo o purchase_id (que o próprio comprador vê),
-- conseguia confirmar a própria compra e ganhar crédito sem pagar via Pix.
-- conceder_trial()/handle_new_user() são "returns trigger" — o Postgres
-- recusa chamada direta fora de contexto de trigger, então não são
-- exploráveis de fato hoje, mas ficam revogadas por padrão de segurança.
--
-- As outras 4 (entregar_leads, contar_novos, metricas_negocio,
-- saldo_creditos) NÃO são SECURITY DEFINER — rodam como o role chamador, e
-- como não existe nenhuma policy de INSERT/UPDATE pra anon/authenticated
-- (só SELECT da própria linha), RLS já bloqueava escrita e limitava leitura
-- à própria linha. Revogadas aqui mesmo assim, por defesa em profundidade e
-- pra bater com o comentário original de cada uma ("só service_role").
-- ============================================================================

revoke execute on function public.confirmar_compra(uuid) from anon, authenticated, public;
grant  execute on function public.confirmar_compra(uuid) to service_role;

revoke execute on function public.conceder_trial() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;

revoke execute on function public.entregar_leads(uuid, uuid, text[], integer, integer) from anon, authenticated, public;
grant  execute on function public.entregar_leads(uuid, uuid, text[], integer, integer) to service_role;

revoke execute on function public.contar_novos(uuid, text[], integer) from anon, authenticated, public;
grant  execute on function public.contar_novos(uuid, text[], integer) to service_role;

revoke execute on function public.metricas_negocio(integer) from anon, authenticated, public;
grant  execute on function public.metricas_negocio(integer) to service_role;

revoke execute on function public.saldo_creditos(uuid) from anon, authenticated, public;
grant  execute on function public.saldo_creditos(uuid) to service_role;
