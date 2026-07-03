-- ============================================================
-- Baseline: player_saves
--
-- The table saveService.js has expected all along (one row per
-- user, whole game state as a JSON blob). Written idempotently
-- (if exists guards) so it is safe whether or not the table
-- was ever created by hand in the dashboard.
-- ============================================================

create table if not exists public.player_saves (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  save_data  jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_saves enable row level security;

drop policy if exists "users manage own save" on public.player_saves;

create policy "users manage own save"
  on public.player_saves for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
