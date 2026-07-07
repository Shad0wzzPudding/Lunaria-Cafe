-- ============================================================
-- Round reputation: the reputation a student GAINS during a round,
-- tracked discretely from their lifetime reputation. Everyone
-- starts a round at 0 and it's the net change from join (can be
-- negative — a failed session or unhappy customers cost rep).
-- ============================================================

alter table public.round_participants
  add column if not exists rep numeric not null default 0;
