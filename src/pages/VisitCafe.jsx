import { useQuery } from '@tanstack/react-query';
import { useGame } from '@/lib/gameState/useGame';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Coffee } from 'lucide-react';
import CafeCanvas from '@/components/cafe/CafeCanvas';
import { VisitProvider } from '@/lib/gameState/VisitProvider';
import { fmtLastSeen } from '@/lib/friends/format';

/**
 * A friend's cafe, drawn from a snapshot of their save.
 *
 * Everything here is deliberately absent: no HUD, no shop, no decorate panel,
 * no focus timer, no camera. The visitor is a guest in a room, not a player of
 * someone else's game — and none of CafeView's earning intervals are mounted,
 * so nothing can be gained or spent while inside.
 */
function VisitStage({ host, onLeave }) {
  // Inside VisitProvider: this is the HOST's cafe, not the visitor's.
  const { state } = useGame();

  return (
    // h-screen + overflow-hidden, matching CafeView: the cafe fills the space
    // it is given rather than the page growing a scrollbar around it.
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-3 border-b border-border/30 px-4 py-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onLeave}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          aria-label="Leave this cafe"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display text-lg text-foreground truncate">
            {state.cafe.name}
          </h1>
          {/* The snapshot is only as fresh as their last save. Naming the SAVE
              rather than their visit is the honest version: "as they left it"
              implies the room is how they meant to leave it, when in truth it
              is whatever last reached the server — which, until the
              beforeunload save is fixed, may be older than their real exit. */}
          <p className="text-xs text-muted-foreground truncate">
            {host.display_name}'s cafe · from their latest save, {fmtLastSeen(host.saved_at)}
          </p>
        </div>
        <div className="flex-1" />
        <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
          <Coffee className="h-3.5 w-3.5" />
          visiting
        </span>
      </header>

      {/* Same layout as CafeView's <main>: flex-1 min-h-0 with the canvas
          centred, so a visited cafe sits where your own one does.
          The backdrop is UNCONDITIONAL here, where CafeView draws it only in
          the immersive theme. A visit is a place you're shown rather than a
          workspace you configure, and it should look its best regardless of
          whichever theme the visitor happens to run. It follows the HOST's
          timeOfDay, so the backdrop and the room agree. */}
      <main
        className="relative flex flex-1 min-h-0 items-center justify-center overflow-auto p-4"
        style={{
          backgroundImage: `url(${
            state.cafe.timeOfDay === 'day'
              ? '/assets/background/C_BG_Daylight.png'
              : '/assets/background/C_BG_Nightfall.png'
          })`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
        }}
      >
        <div className="relative shrink-0">
          <CafeCanvas />
        </div>
      </main>
    </div>
  );
}

export default function VisitCafe() {
  const { state, dispatch } = useGame();
  const target = state.ui?.visitingFriend ?? null;
  const leave = () => dispatch({ type: 'SET_PHASE', payload: 'friends' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['visit-cafe', target?.id],
    enabled: Boolean(target?.id),
    // A visit is a moment, not a subscription — one fetch on entry, and a
    // fresh one next time rather than a cached room from an earlier visit.
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data: rows, error: err } = await supabase.rpc('visit_friend_cafe', {
        _friend_id: target.id,
      });
      if (err) throw err;
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error('That cafe could not be found.');
      return row;
    },
  });

  if (!target) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">No cafe selected.</p>
          <Button size="sm" onClick={leave}>Back to friends</Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <p className="min-h-screen flex items-center justify-center bg-background text-sm text-muted-foreground">
        Walking over to {target.name}'s cafe…
      </p>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm space-y-3 text-center">
          {/* The RPC's messages are written to be read by a player — "Their
              cafe is closed to visitors right now" — so they are shown as-is. */}
          <p className="text-sm text-amber-400">{error.message}</p>
          <Button size="sm" onClick={leave}>Back to friends</Button>
        </div>
      </div>
    );
  }

  return (
    <VisitProvider snapshot={data.snapshot}>
      <VisitStage host={data} onLeave={leave} />
    </VisitProvider>
  );
}
