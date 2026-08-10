import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useGame } from '@/lib/gameState/useGame';
import { Button } from '@/components/ui/button';
import { getDateString } from '@/lib/gameState/gameHelpers';
import { isDetectionZoneVisible, setDetectionZoneVisible, isLowConfFloor, setLowConfFloor, isGeometryGate, setGeometryGate } from '@/lib/ai/browserAI';

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
  // Adjust-during-render: track the game value while the user isn't typing.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setLocal(String(value ?? 0));
  }
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

/**
 * A titled section that folds away.
 *
 * `action` renders BESIDE the toggle rather than inside it — the chaos group
 * carries an "unlock" button, and a button nested in a button is invalid and
 * swallows the inner click.
 */
function Group({ title, note, action, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-border/30 bg-black/10">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 px-3 py-2 text-left hover:bg-muted/20 transition-colors rounded-lg"
        >
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <SectionLabel>{title}</SectionLabel>
          {note}
        </button>
        {action && <div className="shrink-0 pr-3">{action}</div>}
      </div>
      {/* Hidden rather than unmounted: the stat inputs keep their typed-but-
          not-yet-applied value in local state, and folding a group used to
          throw it away. `display: none` also keeps a folded group out of the
          tab order, so nothing behind a closed header is keyboard-reachable. */}
      <div className={`space-y-2 px-3 pb-3 ${open ? '' : 'hidden'}`}>{children}</div>
    </div>
  );
}

export default function DebugPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const [collapsed, setCollapsed] = useState(false);
  // Mirrors browserAI's module flag (the render loop reads that directly);
  // this state only drives the checkbox UI.
  const [showAiZone, setShowAiZone] = useState(isDetectionZoneVisible());
  const toggleAiZone = () => {
    setDetectionZoneVisible(!showAiZone);
    setShowAiZone(!showAiZone);
  };
  // Mirrors browserAI's low-confidence-floor flag (drops the worker's detection
  // floor to 10%); this state only drives the checkbox UI.
  const [lowConfFloor, setLowConfFloorUi] = useState(isLowConfFloor());
  const toggleLowConfFloor = () => {
    setLowConfFloor(!lowConfFloor);
    setLowConfFloorUi(!lowConfFloor);
  };
  // Mirrors browserAI's shape-gate flag (the worker screens amber-band hits by
  // size and aspect); this state only drives the checkbox UI.
  const [geometryGate, setGeometryGateUi] = useState(isGeometryGate());
  const toggleGeometryGate = () => {
    setGeometryGate(!geometryGate);
    setGeometryGateUi(!geometryGate);
  };

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

  // Adjust-during-render: keep inputs tracking live game values.
  const [prevCoins, setPrevCoins] = useState(state.coins);
  if (prevCoins !== state.coins) {
    setPrevCoins(state.coins);
    setCoins(String(state.coins));
  }
  const [prevRep, setPrevRep] = useState(state.reputation);
  if (prevRep !== state.reputation) {
    setPrevRep(state.reputation);
    setRep(String(state.reputation));
  }
  const todaySecs = state.stats?.todaySeconds ?? 0;
  const [prevTodaySecs, setPrevTodaySecs] = useState(todaySecs);
  if (prevTodaySecs !== todaySecs) {
    setPrevTodaySecs(todaySecs);
    setFocusH(Math.floor(todaySecs / 3600));
    setFocusM(Math.floor((todaySecs % 3600) / 60));
    setFocusS(todaySecs % 60);
  }
  const [prevFocusSecs, setPrevFocusSecs] = useState(focusSecsSource);
  if (prevFocusSecs !== focusSecsSource) {
    setPrevFocusSecs(focusSecsSource);
    setTotalH(Math.floor(focusSecsSource / 3600));
    setTotalM(Math.floor((focusSecsSource % 3600) / 60));
    setTotalS(focusSecsSource % 60);
  }

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
              className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-violet-500/40 bg-card/95 backdrop-blur-md p-6 shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1,   y: 0  }}
              exit={{   opacity: 0, scale: 0.9, y: 16  }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Header — fixed; only the body between it and the footer scrolls */}
              <div className="flex shrink-0 items-center justify-between mb-5">
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

              {/* Two-column body — the only scrolling region. items-start keeps
                  a column from stretching when the other one has more open
                  groups than it does. */}
              <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 items-start gap-x-8 gap-y-3">

                {/* ── Left column ── */}
                <div className="space-y-3">

                  <Group
                    title="Chaos Level"
                    action={state.attention.debugAttentionLock && (
                      <button onClick={() => dispatch({ type: 'DEBUG_UNLOCK_ATTENTION' })}
                        className="font-pixel text-[10px] text-amber-400 hover:text-amber-300 transition-colors">
                        locked · unlock
                      </button>
                    )}
                  >
                    <div className="grid grid-cols-2 gap-1.5">
                      {CHAOS_LEVELS.map(({ label, score, color }) => (
                        <button key={label}
                          onClick={() => dispatch({ type: 'DEBUG_SET_ATTENTION_SCORE', payload: score })}
                          className="rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors">
                          <span className={`font-pixel text-[10px] ${color}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </Group>

                  <Group title="Coins">
                    <div className="flex gap-2">
                      <input type="number" min={0} value={coins}
                        onChange={e => setCoins(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyCoins()}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={applyCoins} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </Group>

                  <Group title="Reputation (0–100)">
                    <div className="flex gap-2">
                      <input type="number" min={0} max={100} value={rep}
                        onChange={e => setRep(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applyRep()}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={applyRep} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </Group>

                  <Group title="Focus Time (Today)">
                    {hmsInput(focusH, setFocusH, focusM, setFocusM, focusS, setFocusS, applyFocusTime)}
                  </Group>

                  <Group title="Simulate Date">
                    <div className="flex gap-2">
                      <input type="date" value={debugDate}
                        onChange={e => setDebugDate(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && dispatch({ type: 'DEBUG_SET_DATE', payload: debugDate })}
                        className={`flex-1 ${inputCls}`} />
                      <Button size="sm" onClick={() => dispatch({ type: 'DEBUG_SET_DATE', payload: debugDate })} className="font-pixel text-[10px]">Set</Button>
                    </div>
                  </Group>

                  <Group title="AI Camera">
                    <button onClick={toggleAiZone}
                      className="w-full rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors flex items-center justify-between">
                      <span className="font-pixel text-[10px] text-foreground">Show phone-detector zone</span>
                      <span className={`font-pixel text-[10px] ${showAiZone ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {showAiZone ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <p className="font-body text-[10px] text-muted-foreground/60">
                      Shades the camera edges the phone detector can't see (it runs on the center square).
                    </p>
                    <button onClick={toggleLowConfFloor}
                      className="w-full rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors flex items-center justify-between">
                      <span className="font-pixel text-[10px] text-foreground">Detect phones at 10%</span>
                      <span className={`font-pixel text-[10px] ${lowConfFloor ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {lowConfFloor ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <p className="font-body text-[10px] text-muted-foreground/60">
                      Drops the phone-counting floor to 10% confidence so faint phone-shaped hits count.
                    </p>
                    <button onClick={toggleGeometryGate}
                      className="w-full rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors flex items-center justify-between">
                      <span className="font-pixel text-[10px] text-foreground">Shape gate</span>
                      <span className={`font-pixel text-[10px] ${geometryGate ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                        {geometryGate ? 'ON' : 'OFF'}
                      </span>
                    </button>
                    <p className="font-body text-[10px] text-muted-foreground/60">
                      Screens amber-band hits by size and shape. Off by default — turn it ON if a watch starts counting as a phone, since this is the filter that rejects one.
                    </p>
                  </Group>

                </div>

                {/* ── Right column — Stats Cards ── */}
                <div className="space-y-3">
                  <Group
                    title="Stats Cards"
                    note={(
                      <span className="font-pixel text-[9px] text-muted-foreground/60">
                        ({statsMode === 'period' ? 'period values' : 'lifetime values'})
                      </span>
                    )}
                  >
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
                  </Group>

                  <Group title={statsMode === 'period' ? 'Period Focus Time' : 'Total Focus Time'}>
                    {hmsInput(totalH, setTotalH, totalM, setTotalM, totalS, setTotalS, applyTotalFocus)}
                  </Group>

                </div>
                </div>
              </div>

              <p className="font-body text-[10px] text-muted-foreground/50 text-center mt-5 shrink-0">
                Esc / click outside to collapse · X to close
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
