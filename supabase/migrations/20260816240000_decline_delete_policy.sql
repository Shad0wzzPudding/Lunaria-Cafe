-- ============================================================
-- Close the bypass in the durable decline.
--
-- 20260816220000 made send_friend_request() refuse a declined
-- sender. But the block lives in a ROW, and the delete policy
-- let the blocked person delete that row:
--
--   DELETE /rest/v1/friendships?id=eq.<row>   -> 204
--   send_friend_request(...)                  -> pending
--   ...and the recipient is notified all over again.
--
-- The UI never offered this — declined rows appear in no list —
-- but RLS is what actually enforces it, and RLS allowed it.
-- Verified against the live database before writing this.
--
-- The old policy read "either party removes friendship" and
-- covered three different acts with one rule: unfriending,
-- cancelling a request you sent, and clearing one you declined.
-- For the first two "either party" is right. For the third it is
-- not: the row is the record of a refusal, and the person it
-- protects against must not be able to erase it.
--
-- So the rule splits on status. Everything except a declined row
-- behaves exactly as before.
-- ============================================================

drop policy if exists "either party removes friendship" on public.friendships;

create policy "either party removes friendship"
  on public.friendships for delete
  using (
    case
      -- A declined row is deletable only by whoever DID the declining.
      -- Clearing it is how they take the block back off, which is the
      -- deliberate counterpart to send_friend_request()'s reopen branch.
      -- coalesce covers rows predating declined_by: only the addressee has
      -- ever been able to decline, so they are the decliner by construction.
      when status = 'declined'
        then auth.uid() = coalesce(declined_by, addressee_id)
      -- Unfriending (accepted) and cancelling a request you sent (pending)
      -- are both still "either party", unchanged.
      else auth.uid() = requester_id or auth.uid() = addressee_id
    end
  );
