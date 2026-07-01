import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

export default function MainMenu() {
  const { dispatch } = useGame();

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

            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'settings' })}
              variant="secondary"
              className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>
          </div>

          <p className="font-body text-[11px] text-white/30">
            Prototype v0.1 — Focus & Flourish
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
