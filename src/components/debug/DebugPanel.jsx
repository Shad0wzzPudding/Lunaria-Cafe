import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { Button } from '@/components/ui/button';
import { getDateString } from '@/lib/gameState/gameHelpers';

const CHAOS_LEVELS = [
  { label: 'Calm',              score: 85, color: 'text-emerald-400' },
  { label: 'Cute Chaos',        score: 60, color: 'text-amber-400'   },
  { label: 'Magical Chaos',     score: 40, color: 'text-purple-400'  },
  { label: 'Midnight Incident', score: 15, color: 'text-blue-400'    },
];

const inputCls = 'rounded-md border border-border/40 bg-black/20 px-2 py-1.5 text-sm font-body text-foreground focus:outline-none focus:border-violet-500/60';

function SectionLabel({ children }) {
  return <p className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest">{children}</p>;
}

function NumInput({ label, statKey, value, dispatch }) {
  const [local, setLocal] = useState(String(value ?? 0));
  useEffect(() => setLocal(String(value ?? 0)), [value]);
  const apply = () => {
    const v = parseInt(local, 10);
    if (Number.isFinite(v) && v >= 0)
      dispatch({ type: 'DEBUG_SET_STAT', payload: { key: statKey, value: v } });
  };
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex gap-1.5">
        <input type="number" min={0} value={local}
          onChange={e => setLocal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && apply()}
          className={`flex-1 min-w-0 ${inputCls}`} />
        <Button size="sm" onClick={apply} className="font-pixel text-[10px] shrink-0">Set</Button>
      </div>
    </div>
  );
}

export default function DebugPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const [collapsed, setCollapsed] = useState(false);

  // Left column state
  const [coins,      setCoins]      = useState(String(state.coins));
  const [rep,        setRep]        = useState(String(state.reputation));
  const [debugDate,  setDebugDate]  = useState(state.ui?.debugDate ?? getDateString());
  const [focusH,     setFocusH]     = useState(Math.floor((state.stats?.todaySeconds ?? 0) / 3600));
  const [focusM,     setFocusM]     = useState(Math.floor(((state.stats?.todaySeconds ?? 0) % 3600) / 60));
  const [focusS,     setFocusS]     = useState((state.stats?.todaySeconds ?? 0) % 60);

  const statsMode = state.stats?.statsMode ?? 'period';

  // Right column state — focus time (period or lifetime depending on mode)
  const focusSecsSource = statsMode === 'period'
    ? (state.stats?.periodFocusSeconds ?? 0)
    : (state.stats?.totalFocusSeconds  ?? 0);
  const [totalH, setTotalH] = useState(Math.floor(focusSecsSource / 3600));
  const [totalM, setTotalM] = useState(Math.floor((focusSecsSource % 3600) / 60));
  const [totalS, setTotalS] = useState(focusSecsSource % 60);

  useEffect(() => { setCoins(String(state.coins)); }, [state.coins]);
  useEffect(() => { setRep(String(state.reputation)); }, [state.reputation]);
  useEffect(() => {
    const s = state.stats?.todaySeconds ?? 0;
    setFocusH(Math.floor(s / 3600));
    setFocusM(Math.floor((s % 3600) / 60));
    setFocusS(s % 60);
  }, [state.stats?.todaySeconds]);
  useEffect(() => {
    const s = statsMode === 'period'
      ? (state.stats?.periodFocusSeconds ?? 0)
      : (state.stats?.totalFocusSeconds  ?? 0);
    setTotalH(Math.floor(s / 3600));
    setTotalM(Math.floor((s % 3600) / 60));
    setTotalS(s % 60);
  }, [state.stats?.totalFocusSeconds, state.stats?.periodFocusSeconds, statsMode]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') collapsed ? onClose() : setCollapsed(true);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [collapsed, onClose]);

  const applyCoins = () => {
    const v = parseInt(coins, 10);
    if (Number.isFinite(v) && v >= 0) dispatch({ type: 'ADD_COINS', payload: v - state.coins });
  };
  const applyRep = () => {
    const v = parseInt(rep, 10);
    if (Number.isFinite(v)) {
      const c = Math.max(0, Math.min(100, v));
      dispatch({ type: 'ADD_REPUTATION', payload: c - state.reputation });
    }
  };
  const applyFocusTime = () => {
    const secs = (Number(focusH) || 0) * 3600 + (Number(focusM) || 0) * 60 + (Number(focusS) || 0);
    dispatch({ type: 'DEBUG_SET_TODAY_SECONDS', payload: secs });
  };
  const applyTotalFocus = () => {
    const secs = (Number(totalH) || 0) * 3600 + (Number(totalM) || 0) * 60 + (Number(totalS) || 0);
    const key  = statsMode === 'period' ? 'periodFocusSeconds' : 'totalFocusSeconds';
    dispatch({ type: 'DEBUG_SET_STAT', payload: { key, value: secs } });
  };

  const hmsInput = (h, setH, m, setM, s, setS, onEnter) => (
    <div className="flex items-center gap-1.5">
      <input type="number" min={0} value={h}
        onChange={e => setH(Math.max(0, Number(e.target.value) || 0))}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        className={`w-14 text-center ${inputCls}`} />
      <span className="font-pixel text-[10px] text-muted-foreground">h</span>
      <input type="number" min={0} max={59} value={m}
        onChange={e => setM(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        className={`w-14 text-center ${inputCls}`} />
      <span className="font-pixel text-[10px] text-muted-foreground">m</span>
      <input type="number" min={0} max={59} value={s}
        onChange={e => setS(Math.max(0, Math.min(59, Number(e.target.value) || 0)))}
        onKeyDown={e => e.key === 'Enter' && onEnter()}
        className={`w-14 text-center ${inputCls}`} />
      <span className="font-pixel text-[10px] text-muted-foreground">s</span>
      <Button size="sm" onClick={onEnter} className="font-pixel text-[10px] ml-auto shrink-0">Set</Button>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {collapsed && (
          <motion.button
            className="fixed bottom-[8%] left-4 z-[200] flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-card/95 backdrop-blur-md px-3 py-1.5 shadow-lg hover:bg-muted/30 transition-colors"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={() => setCollapsed(false)}
          >
            <Bug className="w-3 h-3 text-violet-400" />
            <span className="font-pixel text-[10px] text-violet-400">Debug</span>
            <ChevronUp className="w-3 h-3 text-muted-foreground" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!collapsed && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCollapsed(true)} />

            <motion.div
              className="relative w-full max-w-2xl rounded-2xl border border-violet-500/40 bg-card/95 backdrop-blur-md p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1,   y: 0  }}
              exit={{   opacity: 0, scale: 0.9, y: 16  }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-violet-400" />
                  <h2 className="font-pixel text-sm text-violet-400">Debug Panel</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setCollapsed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Collapse">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button onClick={onClose}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5" title="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Two-column body */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-5">

                {/* ── Left column ── */}
                <div className="space-y-5">

                  {/* Chaos Level */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <SectionLabel>Chaos Level</SectionLabel>
                      {state.attention.debugAttentionLock && (
                        <button onClick={() => dispatch({ type: 'DEBUG_UNLOCK_ATTENTION' })}
                          className="font-pixel text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                          locked · unlock
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {CHAOS_LEVELS.map(({ label, score, color }) => (
                        <button key={label}
                          onClick={() => dispatch({ type: 'DEBUG_SET_ATTENTION_SCORE', payload: score })}
                          className="rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                          <span className={`font-pixel text-[10px] ${color}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Coins */}
                  <div className="space-y-2">
                    <SectionLabel>Coins</SectionLabel>
                    <div className="flex gap-2">
                      <input type="number" min={0} value={coins}
                        onChange={e => setCoins(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyCoins()}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={applyCoins} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </div>

                  {/* Reputation */}
                  <div className="space-y-2">
                    <SectionLabel>Reputation (0–100)</SectionLabel>
                    <div className="flex gap-2">
                      <input type="number" min={0} max={100} value={rep}
                        onChange={e => setRep(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyRep()}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={applyRep} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </div>

                  {/* Focus Time Today */}
                  <div className="space-y-2">
                    <SectionLabel>Focus Time (Today)</SectionLabel>
                    {hmsInput(focusH, setFocusH, focusM, setFocusM, focusS, setFocusS, applyFocusTime)}
                  </div>

                  {/* Simulate Date */}
                  <div className="space-y-2">
                    <SectionLabel>Simulate Date</SectionLabel>
                    <div className="flex gap-2">
                      <input type="date" value={debugDate}
                        onChange={e => setDebugDate(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && dispatch({ type: 'DEBUG_SET_DATE', payload: debugDate })}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={() => dispatch({ type: 'DEBUG_SET_DATE', payload: debugDate })} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </div>

                </div>

                {/* ── Right column — Stats Cards ── */}
                <div className="space-y-5">
                  <div className="flex items-center gap-2">
                    <SectionLabel>Stats Cards</SectionLabel>
                    <span className="font-pixel text-[9px] text-muted-foreground/60">
                      ({statsMode === 'period' ? 'period values' : 'lifetime values'})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <NumInput label="Sessions"
                      statKey={statsMode === 'period' ? 'periodSessions'       : 'totalSessions'}
                      value={statsMode  === 'period' ? state.stats?.periodSessions       : state.stats?.totalSessions}
                      dispatch={dispatch} />
                    <NumInput label="Chaos Events"
                      statKey={statsMode === 'period' ? 'periodChaosEvents'    : 'chaosEvents'}
                      value={statsMode  === 'period' ? state.stats?.periodChaosEvents    : state.stats?.chaosEvents}
                      dispatch={dispatch} />
                    <NumInput label="Coins Earned"
                      statKey={statsMode === 'period' ? 'periodCoinsEarned'    : 'coinsEarned'}
                      value={statsMode  === 'period' ? state.stats?.periodCoinsEarned    : state.stats?.coinsEarned}
                      dispatch={dispatch} />
                    <NumInput label="Customers"
                      statKey={statsMode === 'period' ? 'periodCustomersTotal' : 'customersTotal'}
                      value={statsMode  === 'period' ? state.stats?.periodCustomersTotal : state.stats?.customersTotal}
                      dispatch={dispatch} />
                    <NumInput label="Streak (days)" statKey="currentStreak" value={state.stats?.currentStreak} dispatch={dispatch} />
                  </div>

                  {/* Focus Time */}
                  <div className="space-y-2">
                    <SectionLabel>{statsMode === 'period' ? 'Period Focus Time' : 'Total Focus Time'}</SectionLabel>
                    {hmsInput(totalH, setTotalH, totalM, setTotalM, totalS, setTotalS, applyTotalFocus)}
                  </div>

                </div>
              </div>

              <p className="font-body text-[10px] text-muted-foreground/50 text-center mt-5">
                Esc / click outside to collapse · X to close
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
