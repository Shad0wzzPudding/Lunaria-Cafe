import { useGame } from '@/lib/gameState.jsx';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Coins, Star, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SessionSummary() {
  const { state, dispatch } = useGame();
  const [shake, setShake] = useState(false);
  const [hint, setHint] = useState(false);
  const s = state.lastSession;

  const handleBackdropClick = () => {
    setShake(true);
    setHint(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setHint(false), 2500);
  };

  function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  return (
    <AnimatePresence>
      {s && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal wrapper */}
          <motion.div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 gap-3"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={handleBackdropClick}
          >
          {/* Hint message */}
          <AnimatePresence>
            {hint && (
              <motion.div
                className="rounded-lg bg-amber-500/20 border border-amber-500/40 px-4 py-2"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <p className="text-xs text-amber-400 font-body text-center">
                  Press "Back to Cafe" to proceed!
                </p>
              </motion.div>
            )}
          </AnimatePresence>

            {/* Card — everything inside here */}
            <motion.div
              className="w-full max-w-xs rounded-2xl border border-violet-500/30 bg-card/95 backdrop-blur-md p-6 space-y-5 shadow-2xl"
              animate={shake ? { x: [-8, 8, -6, 6, -4, 4, 0] } : {}}
              transition={{ duration: 0.4 }}
              onClick={e => e.stopPropagation()}
            >
              {/* Title */}
              <div className="text-center space-y-1">
                <h2 className="font-pixel text-base text-white">Closing Time!</h2>
                <p className="text-xs text-muted-foreground font-body">
                  Here's how your cafe went
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2">
                <StatCard icon={<Clock className="w-3.5 h-3.5 text-blue-400" />}
                  label="Focused" value={formatDuration(s.durationSeconds)} color="text-white" />

                <StatCard icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />}
                  label="Focus Score" value={s.attentionScore} color="text-white" />

                <StatCard icon={<Coins className="w-3.5 h-3.5 text-amber-400" />}
                  label="Coins Earned" value={`+${s.coinsEarned}`} color="text-amber-300" />

                <StatCard icon={<Star className="w-3.5 h-3.5 text-rose-400" />}
                  label="Reputation" value={`+${s.reputationGain}%`} color="text-rose-300" />

                <StatCard icon={<AlertTriangle className="w-3.5 h-3.5 text-orange-400" />}
                  label="Distractions" value={s.distractions}
                  color={s.distractions > 0 ? "text-orange-400" : "text-muted-foreground"} />
              </div>

              {/* Button */}
              <Button
                className="w-full font-pixel text-xs"
                onClick={() => dispatch({ type: 'CLEAR_SESSION_SUMMARY' })}
              >
                Back to Cafe
              </Button>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
      {icon}
      <span className={`font-pixel text-sm ${color}`}>{value}</span>
      <span className="text-muted-foreground text-[10px] font-body">{label}</span>
    </div>
  );
}