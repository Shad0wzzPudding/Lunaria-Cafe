import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Settings, BookOpen, Users, Radio } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MainMenu() {
  const { dispatch, logout } = useGame();
  const { user, profile, isGuest, chooseRole } = useAuth();
  const { currentRound } = useLiveRound();
  const canSwitchToInstructor = !isGuest && profile?.is_student && profile?.is_instructor;
  const canUseClassrooms = !isGuest && Boolean(profile?.is_student);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Wallpaper */}
      <img
        src="/assets/mainmenu_wallpaper"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
        draggable={false}
      />

      {/* Gradient overlays — darken bottom and left edge for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/10 to-transparent" />

      {/* Signed-in indicator — top-left */}
      <motion.div
        className="absolute top-4 left-4 z-20 flex items-baseline gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.2 }}
      >
        <p className="font-pixel text-xs text-white/70 drop-shadow-md">
          The cafe welcomes you, {isGuest ? 'Guest' : user?.email}!
        </p>
        <button
          type="button"
          onClick={logout}
          className="font-pixel text-xs text-white/45 underline underline-offset-2 hover:text-white transition-colors drop-shadow-md"
        >
          Log out
        </button>
      </motion.div>

      {/* Menu content — anchored to bottom-left */}
      <motion.div
        className="relative z-10 flex flex-col justify-end min-h-screen pb-12 pl-10 md:pb-16 md:pl-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      >
        <motion.div
          className="flex flex-col gap-7 max-w-xs"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
        >
          {/* Title */}
          <div className="space-y-1.5">
            <h1 className="font-pixel text-5xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] leading-tight">
              Lunaria Cafe
            </h1>
            <p className="font-pixel text-sm text-white/55 drop-shadow-md">
              A tiny magical world quietly waiting beside you.
            </p>
            {currentRound && (
              <p className="font-pixel text-xs text-emerald-300 drop-shadow-md flex items-center gap-1.5 pt-1">
                <Radio className="w-3.5 h-3.5" />
                You're in the live-session of {currentRound.classroom_name}!
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2.5">
            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'loading' })}
              className="h-12 font-pixel text-sm tracking-wide gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg shadow-black/40 border border-primary/30"
            >
              <Play className="w-4 h-4" />
              Open Cafe
            </Button>

            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'stats' })}
              variant="secondary"
              className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
            >
              <BarChart3 className="w-4 h-4" />
              Statistics
            </Button>

            {canUseClassrooms && (
              <Button
                onClick={() => dispatch({ type: 'SET_PHASE', payload: 'classrooms' })}
                variant="secondary"
                className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
              >
                <Users className="w-4 h-4" />
                My Classrooms
              </Button>
            )}

            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'settings' })}
              variant="secondary"
              className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>

            {canSwitchToInstructor && (
              <Button
                onClick={() => chooseRole('instructor')}
                variant="secondary"
                className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
              >
                <BookOpen className="w-4 h-4" />
                Switch to Instructor
              </Button>
            )}
          </div>

          <p className="font-body text-[11px] text-white/30">
            Prototype v0.1 — Focus & Flourish
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
