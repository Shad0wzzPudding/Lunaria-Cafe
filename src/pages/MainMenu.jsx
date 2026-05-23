import React, { useMemo } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Settings, Rabbit, Moon, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

function FloatingParticle({ delay, x, y, size }) {
  return (
    <motion.div
      className="absolute rounded-full bg-primary/20"
      style={{ width: size, height: size, left: `${x}%`, top: `${y}%` }}
      animate={{
        y: [0, -20, 0],
        opacity: [0.2, 0.6, 0.2],
        scale: [0.8, 1.2, 0.8],
      }}
      transition={{ duration: 4 + Math.random() * 3, repeat: Infinity, delay }}
    />
  );
}

export default function MainMenu() {
  const { dispatch } = useGame();
  
  const particles = useMemo(() => 
    Array.from({ length: 25 }, (_, i) => ({
      id: i,
      delay: Math.random() * 4,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: 3 + Math.random() * 5,
    })), []);
  
  return (
    <motion.div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-background">
      <motion.div className="absolute inset-0">
        <motion.div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <motion.div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
        <motion.div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/3 rounded-full blur-3xl" />
        {particles.map(p => (
          <FloatingParticle key={p.id} {...p} />
        ))}
        {Array.from({ length: 30 }, (_, i) => (
          <motion.div
            key={`star-${i}`}
            className="absolute rounded-full bg-foreground/20 animate-twinkle"
            style={{
              width: 2,
              height: 2,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 50}%`,
              animationDelay: `${Math.random() * 5}s`,
            }}
          />
        ))}
      </motion.div>
      
      <motion.div 
        className="relative z-10 flex flex-col items-center gap-8 px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      >
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Moon className="w-12 h-12 text-accent/60" />
        </motion.div>
        
        <motion.div className="text-center space-y-3">
          <motion.div 
            className="flex items-center justify-center gap-3"
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <Rabbit className="w-8 h-8 text-primary" />
            <h1 className="font-display text-5xl md:text-6xl font-bold text-foreground tracking-tight">
              Lunaria Cafe
            </h1>
          </motion.div>
          <motion.p 
            className="font-body text-sm text-muted-foreground max-w-md leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            A tiny magical world quietly waiting beside you every night.
          </motion.p>
        </motion.div>
        
        <motion.div 
          className="flex items-center gap-3"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ delay: 0.8 }}
        >
          <motion.div className="w-16 h-px bg-border" />
          <Sparkles className="w-4 h-4 text-primary/40" />
          <motion.div className="w-16 h-px bg-border" />
        </motion.div>
        
        <motion.div 
          className="flex flex-col gap-3 w-64"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
        >
          <Button
            onClick={() => dispatch({ type: 'SET_PHASE', payload: 'management' })}
            className="bg-primary/90 hover:bg-primary text-primary-foreground h-12 font-pixel text-sm tracking-wide gap-2 relative overflow-hidden group"
          >
            <motion.div className="absolute inset-0 bg-accent/10 translate-x-[-100%] group-hover:translate-x-0 transition-transform duration-500" />
            <Play className="w-4 h-4 relative z-10" />
            <span className="relative z-10">Open Cafe</span>
          </Button>
          
          <Button
            onClick={() => dispatch({ type: 'SET_PHASE', payload: 'stats' })}
            variant="secondary"
            className="h-11 font-pixel text-xs tracking-wide gap-2 bg-secondary/60 hover:bg-secondary border border-border/30"
          >
            <BarChart3 className="w-4 h-4" />
            Statistics
          </Button>
          
          <Button
            onClick={() => dispatch({ type: 'SET_PHASE', payload: 'settings' })}
            variant="ghost"
            className="h-11 font-pixel text-xs tracking-wide gap-2 text-muted-foreground hover:text-foreground"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Button>

        </motion.div>
        
        <motion.p 
          className="text-xs text-muted-foreground/40 font-body mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          Prototype v0.1 — Focus & Flourish
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
