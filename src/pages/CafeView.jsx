import React, { useEffect } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import {
  startAttentionFeed,
  stopAttentionFeed,
  onAttentionEvent,
  generateChaosEvent,
  getAIConfig,
} from '@/lib/aiIntegration';
import AttentionCamera from '@/components/cafe/AttentionCamera';
import CafeCanvas from '@/components/cafe/CafeCanvas';
import CafeHUD from '@/components/cafe/CafeHUD';
import ChaosEventLog from '@/components/cafe/ChaosEventLog';
import ParticleOverlay from '@/components/cafe/ParticleOverlay';
import NPCPanel from '@/components/cafe/NPCPanel';
import FocusTimer from '@/components/focus/FocusTimer';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Sofa, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

const CUSTOMER_COLORS = ['#6b7db3', '#7db36b', '#b36b7d', '#b3a06b', '#6bb3a0', '#a06bb3'];
const CUSTOMER_EMOJIS = ['😊', '😌', '🤓', '📖', '☕', '🧙', '🦊', '🌙'];

export default function CafeView() {
  const { state, dispatch, processAIEvent } = useGame();
  const isFocusing = state.focus.status === 'active' || state.focus.status === 'paused';
  const isManagement = state.phase === 'management';
  
  useEffect(() => {
    const unsub = onAttentionEvent((event) => {
      processAIEvent(event);
    });
    return unsub;
  }, [processAIEvent]);
  
  useEffect(() => {
    if (!isFocusing) return;
    
    startAttentionFeed();
    
    const customerInterval = setInterval(() => {
      if (state.cafe.currentCustomers < state.cafe.maxCustomers && Math.random() < 0.3) {
        dispatch({
          type: 'ADD_CUSTOMER',
          payload: {
            id: `cust-${Date.now()}`,
            x: 80 + Math.random() * 580,
            y: 150 + Math.random() * 300,
            color: CUSTOMER_COLORS[Math.floor(Math.random() * CUSTOMER_COLORS.length)],
            emoji: CUSTOMER_EMOJIS[Math.floor(Math.random() * CUSTOMER_EMOJIS.length)],
            arrivedAt: Date.now(),
          },
        });
      }
      
      if (state.npcs.customers.length > 0 && Math.random() < 0.15) {
        const leaving = state.npcs.customers[Math.floor(Math.random() * state.npcs.customers.length)];
        if (leaving) dispatch({ type: 'REMOVE_CUSTOMER', payload: leaving.id });
      }
    }, 4000);
    
    const chaosInterval = setInterval(() => {
      if (state.attention.chaosLevel > 0 && Math.random() < 0.2 * state.attention.chaosLevel) {
        const msg = generateChaosEvent(state.attention.chaosLevel);
        dispatch({ type: 'ADD_CHAOS_EVENT', payload: { message: msg, timestamp: Date.now() } });
      }
    }, 6000);
    
    return () => {
      stopAttentionFeed();
      clearInterval(customerInterval);
      clearInterval(chaosInterval);
    };
  }, [isFocusing, state.cafe.currentCustomers, state.cafe.maxCustomers, state.npcs.customers, state.attention.chaosLevel, dispatch]);

  const startFocusSession = () => {
    dispatch({ type: 'SET_PHASE', payload: 'focus' });
    dispatch({ type: 'START_FOCUS' });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <motion.div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              dispatch({ type: 'SET_PHASE', payload: 'menu' });
              dispatch({ type: 'RESET_FOCUS' });
            }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-display text-lg text-foreground">{state.cafe.name}</h1>
          <span className="font-pixel text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            {isManagement ? 'Management' : 'Focus'}
          </span>
        </motion.div>
        
        <motion.div className="flex items-center gap-3">
          {isFocusing && <FocusTimer compact />}
          <NPCPanel />
        </motion.div>
      </header>
      
      <main className="flex-1 flex items-center justify-center p-4 relative">
        <motion.div 
          className="relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <CafeCanvas />
          <ParticleOverlay />
          <ChaosEventLog />
          {isFocusing && getAIConfig().useLiveAI && <AttentionCamera />}
          <div className="absolute inset-0 rounded-xl pointer-events-none"
            style={{ boxShadow: 'inset 0 0 80px rgba(0,0,0,0.4)' }} />
        </motion.div>
      </main>
      
      <footer className="px-4 py-3 border-t border-border/30 bg-card/40 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <CafeHUD />
          <div className="flex gap-2">
            {isManagement && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 font-pixel text-xs bg-secondary/60 border border-border/30"
                >
                  <Sofa className="w-3.5 h-3.5" />
                  Decorate
                </Button>
                <Button
                  onClick={startFocusSession}
                  size="sm"
                  className="gap-2 font-pixel text-xs bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Focus
                </Button>
              </>
            )}
            {state.focus.status === 'completed' && (
              <Button
                onClick={() => {
                  dispatch({ type: 'RESET_FOCUS' });
                  dispatch({ type: 'SET_PHASE', payload: 'management' });
                }}
                size="sm"
                className="gap-2 font-pixel text-xs bg-accent hover:bg-accent/80 text-accent-foreground"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Collect Rewards
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

