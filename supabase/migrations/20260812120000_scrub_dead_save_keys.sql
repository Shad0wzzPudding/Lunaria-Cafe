-- Scrub dead keys out of player_saves.save_data.
--
-- `save_data` is one schemaless jsonb blob, so keys the game has stopped
-- writing linger in old rows forever: the load-merge spreads them back into
-- live state and the next autosave writes them out again. Nothing reads any of
-- these — this is cosmetic tidying, not a functional migration.
--
--   cafe.maxCustomers          — seat count is now DERIVED from cafe.upgrades
--                                (maxCustomersFor); every pre-2026-08-11 save
--                                carries the old stored 8.
--   cafe.fullNotice            — a short-lived "cafe is full" flag, built and
--                                removed the same day; only saves written in
--                                that window have it.
--   settings.welcomeLetterOpened — went write-only when the welcome letter
--                                became the consent gate (2026-08-09).
--
-- Applied by hand in the Supabase SQL editor (port 5432 is blocked from the
-- CLI here), then recorded in supabase_migrations.schema_migrations.
--
-- ⚠️ DO NOT "simplify" jsonb_exists()/jsonb_exists_any() back to the ? and ?|
-- operators. The Supabase SQL editor reads ? as a parameter placeholder, so
-- those operators never evaluate as the jsonb existence test — they silently
-- report false. That produced an all-zeros preview against rows that plainly
-- contained the keys, and would have made the updates below match no rows at
-- all. The function forms are exactly equivalent and have no such conflict.
--
-- ORDER OF OPERATIONS: run the preview first, then the updates, then the
-- preview again — it should come back all zeros. Have every client reloaded
-- afterwards: a tab still holding a pre-scrub state in memory will write the
-- keys straight back on its next autosave.

-- ── Preview ──────────────────────────────────────────────────────────────────
-- select
--   count(*) filter (where jsonb_exists(save_data->'cafe', 'maxCustomers'))            as cafe_maxcustomers,
--   count(*) filter (where jsonb_exists(save_data->'cafe', 'fullNotice'))              as cafe_fullnotice,
--   count(*) filter (where jsonb_exists(save_data->'settings', 'welcomeLetterOpened')) as settings_welcomeletter,
--   count(*)                                                                           as total_saves
-- from public.player_saves;

-- ── Cafe orphans ─────────────────────────────────────────────────────────────
-- The jsonb_typeof guard is load-bearing: jsonb_set() returns NULL if its
-- new_value is NULL, so a row whose save_data has no 'cafe' object would have
-- its ENTIRE save nulled out by an unguarded update.
update public.player_saves
set save_data = jsonb_set(
      save_data,
      '{cafe}',
      (save_data->'cafe') - 'maxCustomers' - 'fullNotice'
    )
where jsonb_typeof(save_data->'cafe') = 'object'
  and jsonb_exists_any(save_data->'cafe', array['maxCustomers', 'fullNotice']);

-- ── Settings orphan ──────────────────────────────────────────────────────────
update public.player_saves
set save_data = jsonb_set(
      save_data,
      '{settings}',
      (save_data->'settings') - 'welcomeLetterOpened'
    )
where jsonb_typeof(save_data->'settings') = 'object'
  and jsonb_exists(save_data->'settings', 'welcomeLetterOpened');
