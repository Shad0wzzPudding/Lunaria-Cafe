import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { PANEL_BRIGHT_BG } from '@/lib/theme/themeDeriver';
import Leaderboard from '@/components/leaderboard/Leaderboard';

export default function LeaderboardPage() {
  const { state, dispatch } = useGame();
  const { user } = useAuth();
  const room = state.ui.leaderboardRoom;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30"
        style={{ background: PANEL_BRIGHT_BG }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'classrooms' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">Leaderboard</h1>
      </header>

      <main className="max-w-lg mx-auto p-6">
        {room ? (
          <Leaderboard roomId={room.id} roomName={room.name} currentUserId={user?.id} />
        ) : (
          <p className="text-sm text-muted-foreground text-center py-10">
            No classroom selected.
          </p>
        )}
      </main>
    </div>
  );
}
