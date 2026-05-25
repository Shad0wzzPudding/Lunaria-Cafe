import { useGame } from '@/lib/gameState.jsx';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Coins, Star, Zap, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SessionSummary() {
  const { state, dispatch } = useGame();
  const s = state.lastSession;

  return (
    <AnimatePresence>
      {s && (
        <>
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Modal */}
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <div className="w-full max-w-xs rounded-2xl border border-violet-500/30 bg-card/95 backdrop-blur-md p-6 space-y-5 shadow-2xl">

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
                  label="Focused" value={`${s.durationMinutes}m`} color="text-white" />

                <StatCard icon={<Zap className="w-3.5 h-3.5 text-yellow-400" />}
                  label="Attention" value={s.attentionScore} color="text-white" />

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
            </div>
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