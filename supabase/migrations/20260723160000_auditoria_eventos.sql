-- ============================================================================
-- Migration 0005 — Auditoria de eventos de negócio (história 5.4)
--
-- Aplicar via SQL Editor do dashboard OU `npx supabase db push`.
-- ============================================================================

create table public.events (
  id        bigint generated always as identity primary key,
  ator_id   uuid references auth.users(id) on delete set null,
  acao      text not null,
  alvo_tipo text,
  alvo_id   text,
  metadados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index idx_events_ator on public.events (ator_id, criado_em desc);
create index idx_events_acao on public.events (acao, criado_em desc);

comment on table public.events is 'Trilha de auditoria de ações de negócio (história 5.4) — atualmente, ações administrativas. Escrita só pelo backend (service_role).';

alter table public.events enable row level security;

-- Só admin lê a trilha inteira — não é dado do próprio usuário comum ver.
create policy "admin le todos os eventos"
  on public.events for select
  to authenticated
  using (exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  ));

-- Sem policy de insert/update/delete: só o backend (service_role) escreve.
