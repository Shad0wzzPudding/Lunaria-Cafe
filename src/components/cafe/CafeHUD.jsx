import { useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/gameState/useGame';
import { getChaosStage, getConnectionStatus, formatFocusScore, isPhoneDetectionReady, getAIConfig } from '@/lib/ai/aiIntegration';
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
  const scoreDisplay = formatFocusScore(state.attention.score ?? 0);
  // In a teacher-controlled live session, show the reputation earned THIS
  // session (starts at 0) instead of lifetime reputation.
  const inRound = state.focus.roundControlled;
  const sessionRep = state.focus.sessionRep ?? 0;
  // Coins earned THIS live session. Unlike rep, the wallet still accrues
  // normally — only the readout is scoped, so a student sees what this session
  // is worth. Same baseline the end-of-session summary uses (focus.coinsAtStart).
  const sessionCoins = Math.max(0, state.coins - (state.focus.coinsAtStart ?? state.coins));
  const aiStatus = getConnectionStatus();
  // Starting up: either the AI is still connecting, or it's up but the phone
  // model hasn't finished loading (the stream comes first). Mirrors the camera
  // panel's "Loading model" card, so the two never disagree. Browser-AI only —
  // other modes never set phoneReady, so they'd read as loading forever.
  // Read once per mount: getAIConfig() hits storage + JSON.parse, and this
  // component re-renders on every timer tick. The mode can't change while the
  // HUD is mounted (switching it happens in Settings, a different phase).
  const isBrowserAI = useMemo(() => getAIConfig().aiMode === 'browser', []);
  const aiLoading =
    isBrowserAI &&
    (aiStatus === 'connecting' || (aiStatus === 'live' && !isPhoneDetectionReady()));
  const sourceLabel =
    state.attention.source === 'browser'
      ? 'Browser AI'
      : state.attention.source === 'live'
        ? 'AI Camera'
        : state.attention.source === 'simulation'
          ? 'Simulated'
          : 'Offline';

  return (
    <div className="relative flex flex-wrap items-center gap-2 min-w-0">
      <span className="relative inline-flex">
        <StatPill
          icon={Coins}
          value={inRound ? `+${sessionCoins}` : state.coins}
          colorClass="text-amber-300"
          iconColor="#f0c674"
          title={
            inRound
              ? 'Coins earned this live session (still added to your total)'
              : 'Coins — earn by serving customers and finishing focus sessions'
          }
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
        value={inRound ? `${sessionRep >= 0 ? '+' : ''}${sessionRep}` : `${state.reputation}%`}
        colorClass="text-rose-300"
        iconColor="#f0a0b8"
        title={
          inRound
            ? 'Reputation earned this live session'
            : 'Cafe reputation — goes up when you serve customers and complete focus'
        }
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
        value={scoreDisplay}
        colorClass="text-emerald-300"
        iconColor={chaos.color}
        title="Focus score from your session / AI camera"
      />
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-card/60 px-2.5 py-1.5 text-xs text-muted-foreground"
        title={
          aiLoading
            ? 'Loading the phone-detection model — detection starts once it is ready'
            : aiStatus === 'degraded'
              ? 'Phone detection offline — face tracking still running'
              : undefined
        }
      >
        {aiLoading ? (
          // Amber while the model loads: the session is running but not yet
          // fully armed, so green would over-promise and "Offline" would lie.
          <Wifi className="w-3.5 h-3.5 text-amber-400" />
        ) : aiStatus === 'live' || aiStatus === 'connecting' ? (
          <Wifi className="w-3.5 h-3.5 text-emerald-400" />
        ) : aiStatus === 'degraded' ? (
          // Amber, not green: the session runs but phone detection is dead —
          // the backup signal for when the camera panel's banner is off-screen.
          <Wifi className="w-3.5 h-3.5 text-amber-400" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        <span className="font-pixel text-[10px]">{aiLoading ? 'Loading...' : sourceLabel}</span>
      </span>
    </div>
  );
}
