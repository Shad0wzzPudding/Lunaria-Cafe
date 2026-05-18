import { useGame } from '@/lib/gameState.jsx';
import { getChaosStage, getConnectionStatus } from '@/lib/aiIntegration';
import { Coins, Users, Sparkles, Wifi, WifiOff } from 'lucide-react';

export default function CafeHUD() {
  const { state } = useGame();
  const chaos = getChaosStage(state.attention.score);
  const aiStatus = getConnectionStatus();
  const sourceLabel =
    state.attention.source === 'live'
      ? 'AI Camera'
      : state.attention.source === 'simulation'
        ? 'Simulated'
        : 'Offline';

  return (
    <span className="flex flex-wrap items-center gap-4 text-sm">
      <span className="inline-flex items-center gap-2">
        <Coins className="w-4 h-4 text-accent" />
        <span className="font-pixel text-xs">{state.coins}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Users className="w-4 h-4 text-primary" />
        <span className="font-pixel text-xs">
          {state.npcs.customers.length}/{state.cafe.maxCustomers}
        </span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Sparkles className="w-4 h-4" style={{ color: chaos.color }} />
        <span className="font-pixel text-xs" style={{ color: chaos.color }}>
          Focus {state.attention.score}
        </span>
        <span className="text-xs text-muted-foreground">({chaos.name})</span>
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        {aiStatus === 'live' || aiStatus === 'connecting' ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        {sourceLabel}
      </span>
      {state.attention.warningMessage ? (
        <span className="text-xs text-amber-400 max-w-xs truncate">
          {state.attention.warningMessage}
        </span>
      ) : null}
    </span>
  );
}
