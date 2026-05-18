import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/gameState.jsx';
import { getChaosStage, getConnectionStatus } from '@/lib/aiIntegration';
import { Coins, Heart, Users, Sparkles, Wifi, WifiOff } from 'lucide-react';

function StatPill({ icon: Icon, value, colorClass, iconColor, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/80 px-3 py-1.5 ${colorClass}`}
    >
      <Icon className="w-4 h-4 shrink-0" style={{ color: iconColor }} />
      <span className="font-pixel text-xs tabular-nums">{value}</span>
    </span>
  );
}

export default function CafeHUD() {
  const { state, dispatch } = useGame();

  useEffect(() => {
    if (!state.ui.coinFloat) return undefined;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_COIN_FLOAT' }), 1600);
    return () => clearTimeout(t);
  }, [state.ui.coinFloat, dispatch]);
  const chaos = getChaosStage(state.attention.score);
  const aiStatus = getConnectionStatus();
  const sourceLabel =
    state.attention.source === 'live'
      ? 'AI Camera'
      : state.attention.source === 'simulation'
        ? 'Simulated'
        : 'Offline';

  return (
    <div className="relative flex flex-wrap items-center gap-2 min-w-0">
      <span className="relative inline-flex">
        <StatPill
          icon={Coins}
          value={state.coins}
          colorClass="text-amber-300"
          iconColor="#f0c674"
          title="Coins — earn by serving customers and finishing focus sessions"
        />
        <AnimatePresence>
          {state.ui.coinFloat ? (
            <motion.span
              key={state.ui.coinFloat.id}
              initial={{ opacity: 0, y: 4, scale: 0.85 }}
              animate={{ opacity: 1, y: -22, scale: 1.05 }}
              exit={{ opacity: 0, y: -36 }}
              className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 font-pixel text-sm text-amber-200 whitespace-nowrap"
            >
              +{state.ui.coinFloat.amount}
            </motion.span>
          ) : null}
        </AnimatePresence>
      </span>
      <StatPill
        icon={Heart}
        value={`${state.reputation}%`}
        colorClass="text-rose-300"
        iconColor="#f0a0b8"
        title="Cafe reputation — goes up when you serve customers and complete focus"
      />
      <StatPill
        icon={Users}
        value={`${state.npcs.customers.length}/${state.cafe.maxCustomers}`}
        colorClass="text-sky-200"
        iconColor="#9ec8e8"
        title="Customers in your cafe right now"
      />
      <StatPill
        icon={Sparkles}
        value={state.attention.score}
        colorClass="text-emerald-300"
        iconColor={chaos.color}
        title="Focus score from your session / AI camera"
      />
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground">
        {aiStatus === 'live' || aiStatus === 'connecting' ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span className="font-pixel text-[10px]">{sourceLabel}</span>
      </span>
    </div>
  );
}
