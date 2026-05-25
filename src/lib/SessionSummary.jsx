import { useGame } from '@/lib/gameState';
import { Button } from '@/components/ui/button';
import { Coins, Star, Clock, Zap, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SessionSummary() {
  const { state, dispatch } = useGame();
  const { stats, coins, reputation, attention } = state;

  // Grab last session data from stats
  const sessionMins = stats.todayMinutes;
  const coinsEarned = stats.coinsEarned;
  const chaosEvents = attention.chaosEvents.length;
  const attentionScore = attention.score;

  return (
    <motion.div
      className="min-h-screen flex items-center justify-center bg-background"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-violet-500/30 bg-violet-500/10 p-8 text-center space-y-6">
        
        {/* Title */}
        <div>
          <h2 className="font-pixel text-xl text-white">Session Complete!</h2>
          <p className="text-xs text-muted-foreground mt-1 font-body">
            Your cafe thanks you for focusing
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-white font-pixel text-base">{sessionMins}m</span>
            <span className="text-muted-foreground text-xs">Focus Time</span>
          </div>

          <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 font-pixel text-base">+{coinsEarned}</span>
            <span className="text-muted-foreground text-xs">Coins Earned</span>
          </div>

          <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
            <Star className="w-4 h-4 text-rose-400" />
            <span className="text-rose-300 font-pixel text-base">{reputation}%</span>
            <span className="text-muted-foreground text-xs">Reputation</span>
          </div>

          <div className="rounded-lg bg-black/30 p-3 flex flex-col items-center gap-1">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-white font-pixel text-base">{attentionScore}</span>
            <span className="text-muted-foreground text-xs">Attention Score</span>
          </div>
        </div>

        {/* Chaos warning if any */}
        {chaosEvents > 0 && (
          <p className="text-xs text-red-400 font-body">
            ⚠️ {chaosEvents} distraction{chaosEvents > 1 ? 's' : ''} detected this session
          </p>
        )}

        {/* Continue button */}
        <Button
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'management' })}
          className="w-full font-pixel text-sm bg-primary/90 hover:bg-primary"
        >
          Back to Cafe
        </Button>
      </div>
    </motion.div>
  );
}