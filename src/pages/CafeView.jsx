import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { FURNITURE_CATALOG } from '@/lib/furnitureCatalog';
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
import PhoneWarning from '@/components/focus/PhoneWarning';
import DecoratePanel from '@/components/cafe/DecoratePanel';
import GameFeedback from '@/components/cafe/GameFeedback';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Sofa, Sparkles, Square, Pause, Wand2, X } from 'lucide-react';
import { motion } from 'framer-motion';

const CUSTOMER_COLORS = ['#6b7db3', '#7db36b', '#b36b7d', '#b3a06b', '#6bb3a0', '#a06bb3'];
const CUSTOMER_EMOJIS = ['😊', '😌', '🤓', '📖', '☕', '🧙', '🦊', '🌙'];

function BgModePanel({ state, dispatch, onClose }) {
  const panelRef = useRef(null);
  const { bgMode } = state.cafe;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const modes = [
    {
      id: 'immersive',
      label: 'Immersive',
      icon: '🌙',
      desc: 'Night during focus, day when resting.',
    },
    {
      id: 'reallife',
      label: 'Real-life',
      icon: '🕐',
      desc: 'Follows your local time (night 7PM–6AM).',
    },
    {
      id: 'freestyle',
      label: 'Freestyle',
      icon: '✨',
      desc: 'Toggle day/night manually anytime.',
    },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-0 z-50 w-72 rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm text-foreground">Background Mode</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {modes.map((mode) => (
          <button
            key={mode.id}
            type="button"
            onClick={() => {
              dispatch({ type: 'SET_BG_MODE', payload: mode.id });
              onClose();
            }}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              bgMode === mode.id
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border/40 bg-secondary/30 hover:border-primary/40 text-muted-foreground'
            }`}
          >
            <span className="text-lg mt-0.5">{mode.icon}</span>
            <div>
              <div className="font-pixel text-xs font-semibold">{mode.label}</div>
              <div className="font-body text-[11px] mt-0.5 opacity-80">{mode.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function CafeView() {
  const { state, dispatch, processAIEvent } = useGame();
  const isFocusing = state.focus.status === 'active' || state.focus.status === 'paused';
  const isManagement = state.phase === 'management';
  const [showBgModePanel, setShowBgModePanel] = useState(false);

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
    const sittable = state.cafe.furniture.filter(f => FURNITURE_CATALOG[f.type]?.sittable);
    const occupiedIds = new Set(state.npcs.customers.map(c => c.seatedAt).filter(Boolean));
    const freeSeat = sittable.find(f => !occupiedIds.has(f.id));
    const cat = freeSeat ? FURNITURE_CATALOG[freeSeat.type] : null;

    dispatch({
      type: 'ADD_CUSTOMER',
      payload: {
        id: `cust-${Date.now()}`,
        x: freeSeat ? freeSeat.x + freeSeat.w / 2 + (cat?.seatDx ?? 0) : 80 + Math.random() * 580,
        y: freeSeat ? freeSeat.y + freeSeat.h / 2 + (cat?.seatDy ?? 0) : 150 + Math.random() * 300,
        seatedAt: freeSeat?.id ?? null,
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
 }, [isFocusing, state.cafe.currentCustomers, state.cafe.maxCustomers, state.npcs.customers, state.cafe.furniture, state.attention.chaosLevel, dispatch]);
  const startFocusSession = () => {
    dispatch({ type: 'SET_PHASE', payload: 'focus' });
    dispatch({ type: 'START_FOCUS' });
  };

  // 👇 ADD HERE
  useEffect(() => {
    const bgMode = state.cafe.bgMode ?? 'freestyle';

    if (bgMode === 'immersive') {
      dispatch({
        type: 'SET_TIME_OF_DAY',
        payload: isFocusing ? 'night' : 'day',
      });
      return;
    }

    if (bgMode === 'reallife') {
      const checkTime = () => {
        const hour = new Date().getHours();
        const isNight = hour >= 19 || hour < 6;
        dispatch({ type: 'SET_TIME_OF_DAY', payload: isNight ? 'night' : 'day' });
      };
      checkTime();
      const interval = setInterval(checkTime, 60_000);
      return () => clearInterval(interval);
    }
  }, [state.cafe.bgMode, isFocusing, dispatch]);

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {isFocusing && <PhoneWarning />}
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
          {isFocusing && (getAIConfig().aiMode === 'browser' || getAIConfig().aiMode === 'live' || getAIConfig().useLiveAI) && <AttentionCamera />}
        </motion.div>
      </main>

      <footer className="shrink-0 z-30 px-4 py-3 border-t border-border/30 bg-card/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CafeHUD />
          <div className="flex flex-wrap gap-2 ml-auto">
            {isManagement && !state.cafe.decorateMode && (
              <>
              {/* Wand button */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowBgModePanel(v => !v)}
                  title="Background mode"
                >
                  <Wand2 className="w-4 h-4" />
                </Button>
                {showBgModePanel && (
                  <BgModePanel
                    state={state}
                    dispatch={dispatch}
                    onClose={() => setShowBgModePanel(false)}
                  />
                )}
              </div>

              {/* Freestyle toggle only */}
              {state.cafe.bgMode === 'freestyle' && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="gap-2 font-pixel text-xs"
                  onClick={() => dispatch({
                    type: 'SET_TIME_OF_DAY',
                    payload: state.cafe.timeOfDay === 'day' ? 'night' : 'day',
                  })}
                >
                  {state.cafe.timeOfDay === 'day' ? '🌙 Night' : '☀️ Day'}
                </Button>
              )}
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
