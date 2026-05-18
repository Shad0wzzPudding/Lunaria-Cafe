import React from 'react';
import { useGame } from '@/lib/gameState.jsx';
import FocusTimer from '@/components/focus/FocusTimer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Rabbit, Moon } from 'lucide-react';
import { motion } from 'framer-motion';

export default function FocusSession() {
  const { state, dispatch } = useGame();
  
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            dispatch({ type: 'RESET_FOCUS' });
            dispatch({ type: 'SET_PHASE', payload: 'management' });
          }}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">Focus Session</h1>
      </header>
      
      <main className="flex-1 flex items-center justify-center p-6">
        <motion.div
          className="text-center space-y-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          {/* Decorative header */}
          <div className="flex items-center justify-center gap-3">
            <Moon className="w-5 h-5 text-accent/50" />
            <Rabbit className="w-6 h-6 text-primary/60 animate-float" />
            <Moon className="w-5 h-5 text-accent/50" />
          </div>
          
          <p className="font-body text-sm text-muted-foreground max-w-xs mx-auto">
            Choose your focus mode and let the cafe come alive while you study.
          </p>
          
          <FocusTimer />
          
          {state.focus.status === 'active' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <Button
                onClick={() => dispatch({ type: 'SET_PHASE', payload: 'management' })}
                variant="secondary"
                size="sm"
                className="font-pixel text-xs gap-2 bg-secondary/60 border border-border/30"
              >
                <Rabbit className="w-3.5 h-3.5" />
                Watch Cafe
              </Button>
            </motion.div>
          )}
          
          <div className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
            The cafe will run automatically while you focus. Customers arrive, rabbits roam, and magic happens.
          </div>
        </motion.div>
      </main>
    </div>
  );
}