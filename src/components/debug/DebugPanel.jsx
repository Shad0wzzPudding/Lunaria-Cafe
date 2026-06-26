import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { Button } from '@/components/ui/button';

const CHAOS_LEVELS = [
  { label: 'Calm',              score: 85, color: 'text-emerald-400' },
  { label: 'Cute Chaos',        score: 60, color: 'text-amber-400'   },
  { label: 'Magical Chaos',     score: 40, color: 'text-purple-400'  },
  { label: 'Midnight Incident', score: 15, color: 'text-blue-400'    },
];

export default function DebugPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const [collapsed, setCollapsed] = useState(false);
  const [coins, setCoins] = useState(String(state.coins));
  const [rep,   setRep]   = useState(String(state.reputation));

  useEffect(() => { setCoins(String(state.coins));    }, [state.coins]);
  useEffect(() => { setRep(String(state.reputation)); }, [state.reputation]);

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
      const clamped = Math.max(0, Math.min(100, v));
      dispatch({ type: 'ADD_REPUTATION', payload: clamped - state.reputation });
    }
  };

  return (
    <>
      {/* Collapsed pill — always visible when collapsed */}
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

      {/* Full panel overlay */}
      <AnimatePresence>
        {!collapsed && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCollapsed(true)} />

            <motion.div
              className="relative w-full max-w-sm rounded-2xl border border-violet-500/40 bg-card/95 backdrop-blur-md p-6 space-y-5 shadow-2xl"
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1,   y: 0  }}
              exit={{   opacity: 0, scale: 0.9, y: 16  }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-violet-400" />
                  <h2 className="font-pixel text-sm text-violet-400">Debug Panel</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCollapsed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    title="Collapse"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button
                    onClick={onClose}
                    className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chaos Level */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest">Chaos Level</p>
                  {state.attention.debugAttentionLock && (
                    <button
                      onClick={() => dispatch({ type: 'DEBUG_UNLOCK_ATTENTION' })}
                      className="font-pixel text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                    >
                      locked · unlock
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {CHAOS_LEVELS.map(({ label, score, color }) => (
                    <button
                      key={label}
                      onClick={() => dispatch({ type: 'DEBUG_SET_ATTENTION_SCORE', payload: score })}
                      className="rounded-lg border border-border/40 bg-black/20 px-3 py-2 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className={`font-pixel text-[10px] ${color}`}>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Coins */}
              <div className="space-y-2">
                <p className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest">Coins</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    value={coins}
                    onChange={e => setCoins(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyCoins()}
                    className="flex-1 rounded-md border border-border/40 bg-black/20 px-3 py-1.5 text-sm font-body text-foreground focus:outline-none focus:border-violet-500/60"
                  />
                  <Button size="sm" onClick={applyCoins} className="font-pixel text-[10px]">Set</Button>
                </div>
              </div>

              {/* Reputation */}
              <div className="space-y-2">
                <p className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest">Reputation (0–100)</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={rep}
                    onChange={e => setRep(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyRep()}
                    className="flex-1 rounded-md border border-border/40 bg-black/20 px-3 py-1.5 text-sm font-body text-foreground focus:outline-none focus:border-violet-500/60"
                  />
                  <Button size="sm" onClick={applyRep} className="font-pixel text-[10px]">Set</Button>
                </div>
              </div>

              <p className="font-body text-[10px] text-muted-foreground/50 text-center">
                Esc / click outside to collapse · X to close
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
