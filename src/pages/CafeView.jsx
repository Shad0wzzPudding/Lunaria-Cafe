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
import DecoratePanel from '@/components/cafe/DecoratePanel';
import GameFeedback from '@/components/cafe/GameFeedback';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Sofa, Sparkles, Square, Pause } from 'lucide-react';
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
        if (leaving) dispatch({ type: 'SERVE_CUSTOMER', payload: leaving.id });
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
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <header className="shrink-0 z-20 flex items-center justify-between px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-3">
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
        </div>

        <div className="flex items-center gap-3">
          {isFocusing && <FocusTimer compact />}
          <NPCPanel />
        </div>
      </header>

      <main className="relative flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
        <motion.div
          className="relative shrink-0"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <CafeCanvas />
          <ParticleOverlay />
          <ChaosEventLog />
          <GameFeedback />
          <DecoratePanel />
          {isFocusing && getAIConfig().useLiveAI && <AttentionCamera />}
        </motion.div>
      </main>

      <footer className="shrink-0 z-30 px-4 py-3 border-t border-border/30 bg-card/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CafeHUD />
          <div className="flex flex-wrap gap-2 ml-auto">
            {isManagement && !state.cafe.decorateMode && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 font-pixel text-xs"
                  onClick={() => dispatch({ type: 'SET_DECORATE_MODE', payload: true })}
                >
                  <Sofa className="w-3.5 h-3.5" />
                  Decorate
                </Button>
                <Button
                  onClick={startFocusSession}
                  size="sm"
                  className="gap-2 font-pixel text-xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Focus
                </Button>
              </>
            )}
            {isFocusing && (
              <>
                {state.focus.status === 'active' ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-2 font-pixel text-xs"
                    onClick={() => dispatch({ type: 'PAUSE_FOCUS' })}
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="gap-2 font-pixel text-xs"
                    onClick={() => dispatch({ type: 'RESUME_FOCUS' })}
                  >
                    <Play className="w-3.5 h-3.5" />
                    Resume
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  className="gap-2 font-pixel text-xs"
                  onClick={() => dispatch({ type: 'END_FOCUS' })}
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Focus
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
