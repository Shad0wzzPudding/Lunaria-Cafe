-- ============================================================
-- Stop the blocked sender simply READING the decline.
--
-- 20260816220000 refuses a declined sender silently, and its
-- comment claims this denies them a probe. It does not. The
-- SELECT policy, untouched since 20260814120000, is:
--
--   using (requester_id = auth.uid() or addressee_id = auth.uid())
--
-- so one request answers the question outright:
--
--   GET /rest/v1/friendships?select=*
--   -> [{ status: "declined", declined_by: "<their id>", ... }]
--
-- Verified against the live database. The careful silence in the
-- RPC was decorative while the table itself told them, and the
-- declined_by column added by that same migration made the
-- answer more precise, not less.
--
-- The client never needs this read: the friend and request lists
-- come from SECURITY DEFINER RPCs (which bypass RLS and are
-- unaffected), and the only direct table access anywhere in the
-- app is the DELETE behind the unfriend/withdraw button.
--
-- So a declined row becomes visible only to whoever declined it.
-- To the person who was declined the row simply does not exist,
-- which is exactly the story the silent refusal tells: their
-- request went out, and nothing came back. Consistent, rather
-- than contradicted one table read later.
-- ============================================================

drop policy if exists "read own friendships" on public.friendships;

create policy "read own friendships"
  on public.friendships for select
  using (
    case
      -- Mirrors the DELETE policy from 20260816240000 exactly. coalesce
      -- covers rows predating declined_by: only the addressee has ever been
      -- able to decline, so they are the decliner by construction.
      when status = 'declined'
        then auth.uid() = coalesce(declined_by, addressee_id)
      else auth.uid() = requester_id or auth.uid() = addressee_id
    end
  );
