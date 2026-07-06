import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';
import {
  startAttentionFeed,
  stopAttentionFeed,
  onAttentionEvent,
  generateChaosEvent,
  setAIScoreFrozen,
} from '@/lib/ai/aiIntegration';
import AttentionCamera from '@/components/cafe/AttentionCamera';
import CafeCanvas from '@/components/cafe/CafeCanvas';
import CafeHUD from '@/components/cafe/CafeHUD';
import ChaosEventLog from '@/components/cafe/ChaosEventLog';
import ChaosGauge from '@/components/cafe/ChaosGauge';
import ParticleOverlay from '@/components/cafe/ParticleOverlay';
import NPCPanel from '@/components/cafe/NPCPanel';
import FocusTimer from '@/components/focus/FocusTimer';
import PhoneWarning from '@/components/focus/PhoneWarning';
import LowScoreWarning from '@/components/focus/LowScoreWarning';
import DecoratePanel from '@/components/cafe/DecoratePanel';
import GameFeedback from '@/components/cafe/GameFeedback';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Play, Sofa, Sparkles, Square, Pause, Wand2, X, BarChart2, BarChart3, RefreshCw, Store, Coins, Sprout, Coffee, Moon, Star, Crown, PawPrint, Gamepad2 } from 'lucide-react';
import StatsCharts from '@/components/stats/StatsCharts';
import { motion, AnimatePresence } from 'framer-motion';
import SessionSummary from '@/components/cafe/SessionSummary';
import JournalPanel from '@/components/cafe/JournalPanel';
import PetShopPanel from '@/components/cafe/PetShopPanel';
import FocusModePrompt from '@/components/cafe/FocusModePrompt';
import ExitSessionPrompt from '@/components/cafe/ExitSessionPrompt';
import ZenFocusView from '@/components/cafe/ZenFocusView';
import { ZEN_PICTURES } from '@/components/cafe/zenPictures';
import { Sounds } from '@/lib/sounds';
import { toast } from 'sonner';
import { getThemeMode, getThemeHex, getGlassShadeHex, getFocusPanelStyle, getGlassGradient, FOCUS_GLASS_BASE } from '@/lib/theme/themeDeriver';
import { CAFE_W, CAFE_H, findRandomOpenSpot } from '@/lib/cafe/spatial.js';
import { DANGER_SECONDS } from '@/components/focus/useDangerCountdown';

const CHAOS_STAGE_NAMES = { 1: 'Cute Chaos', 2: 'Magical Chaos', 3: 'Midnight Incident' };

const IS_MAC          = navigator.userAgent.includes('Mac');
const IS_WINDOWS      = navigator.userAgent.includes('Win');
const NOTIF_SUPPORTED = typeof Notification !== 'undefined';
// iPadOS 13+ in desktop mode reports as Mac but has touch points
const IS_MOBILE_OR_TABLET = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (IS_MAC && navigator.maxTouchPoints > 1);

const JOURNAL_BUTTON_ART = '/assets/journal-button.png';

const CUSTOMER_COLORS = ['#6b7db3', '#7db36b', '#b36b7d', '#b3a06b', '#6bb3a0', '#a06bb3'];
const CUSTOMER_EMOJIS = ['😊', '😌', '🤓', '📖', '☕', '🧙', '🦊', '🌙'];
const CUSTOMER_RADIUS = 12;

const REPUTATION_TIERS = [
  { min: 0,   max: 19,  name: 'Newcomer',  icon: Sprout,   color: '#9ca3af' },
  { min: 20,  max: 39,  name: 'Local Gem', icon: Coffee,   color: '#7ec8a0' },
  { min: 40,  max: 59,  name: 'Popular',   icon: Sparkles, color: '#6bb3d4' },
  { min: 60,  max: 79,  name: 'Renowned',  icon: Moon,     color: '#cc7ada' },
  { min: 80,  max: 99,  name: 'Legendary', icon: Star,     color: '#f0c674' },
  { min: 100, max: 100, name: 'Mythic',    icon: Crown,    color: '#f472b6' },
];

function getCurrentTier(rep) {
  for (let i = REPUTATION_TIERS.length - 1; i >= 0; i--) {
    if (rep >= REPUTATION_TIERS[i].min) return REPUTATION_TIERS[i];
  }
  return REPUTATION_TIERS[0];
}

// Upgrade data - can be expanded with actual effects later
const CAFE_UPGRADES = [
  { icon: '🪑', name: 'Extra Seating',   desc: 'Adds 2 more seats for customers.',  repReq: 30,  cost: 200  },
  { icon: '🧙', name: 'Skilled Barista', desc: 'Serves customers twice as fast.',   repReq: 50,  cost: 500  },
  { icon: '🌙', name: 'VIP Corner',      desc: 'Attracts higher-paying guests.',    repReq: 70,  cost: 800  },
  { icon: '🏰', name: 'Cafe Expansion',  desc: "Double your cafe's capacity.",      repReq: 90,  cost: 1500 },
];

function CafeStatsPanel({ state, onClose }) {
  const panelRef = useRef(null);
  const reputation = state.reputation ?? 0;
  const currentTier = getCurrentTier(reputation);
  const tierIdx = REPUTATION_TIERS.indexOf(currentTier);
  const nextTier = REPUTATION_TIERS[tierIdx + 1];
  const progress = nextTier
    ? ((reputation - currentTier.min) / (nextTier.min - currentTier.min)) * 100
    : 100;

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // A lapsed streak: current is 0 but a previous run was lost (see mergeLoadedSave).
  const streakBroken = (state.stats?.currentStreak ?? 0) === 0 && (state.stats?.lapsedStreak ?? 0) > 0;

  // Stats to display - can be expanded with more interesting metrics later
  const stats = [
    { icon: '👥', label: 'Customers',   value: state.stats?.customersTotal ?? 0 },
    { icon: '☕', label: 'Sessions',    value: state.stats?.totalSessions ?? 0 },
    { icon: '🔥', label: 'Streak',
      labelNode: streakBroken ? <>Streak <span className="text-destructive">(Lost!)</span></> : undefined,
      value: streakBroken
        ? <span className="opacity-50" aria-label={`Streak broken, was ${state.stats.lapsedStreak} days`}>
            0d <span className="line-through">{state.stats.lapsedStreak}</span>
          </span>
        : `${state.stats?.currentStreak ?? 0}d` },
    { icon: '⏱️', label: 'Focus Time',  value: `${state.stats?.totalFocusMinutes ?? 0}m` },
    { icon: Coins, label: 'Coins Earned',value: state.stats?.coinsEarned ?? 0, color: '#f0c674' },
    { icon: '🌀', label: 'Chaos Events',value: state.stats?.chaosEvents ?? 0 },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-10 z-50 w-[26rem] rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
      style={getFocusPanelStyle()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm text-foreground">Cafe Stats</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Reputation tier section */}
      <div className="mb-4 rounded-lg border border-border/30 p-3" style={{ background: `${currentTier.color}10` }}>
        <div className="text-[10px] font-pixel text-muted-foreground mb-3 uppercase tracking-wider">Reputation Tier</div>

        <div className="flex justify-between items-end gap-1 mb-3">
          {REPUTATION_TIERS.map((tier) => {
            const isCurrent = tier.name === currentTier.name;
            const isLocked = reputation < tier.min;
            return (
              <div key={tier.name} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  className="relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300"
                  style={isCurrent ? {
                    background: `${tier.color}25`,
                    boxShadow: `0 0 0 2px ${tier.color}, 0 0 14px ${tier.color}90`,
                  } : {
                    background: isLocked ? 'transparent' : `${tier.color}12`,
                  }}
                >
                  <span style={{ opacity: isLocked ? 0.2 : 1 }}>
                    {React.createElement(tier.icon, {
                      size: isCurrent ? 17 : 14,
                      strokeWidth: 2,
                      style: { color: isLocked ? 'var(--muted-foreground)' : tier.color },
                    })}
                  </span>
                </div>
                <span
                  className="text-[8px] font-pixel text-center leading-tight"
                  style={{ color: isCurrent ? tier.color : 'var(--muted-foreground)', opacity: isLocked ? 0.3 : isCurrent ? 1 : 0.65 }}
                >
                  {tier.name}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-border/40 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: currentTier.color }}
            />
          </div>
          <span className="text-[9px] font-pixel text-muted-foreground whitespace-nowrap">
            {reputation}{nextTier ? `/${nextTier.min}` : ' MAX'}
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {stats.map(({ icon, label, labelNode, value, color }) => (
          <div key={label} className="rounded-lg bg-secondary/30 border border-border/20 p-2 text-center">
            <div className="mb-0.5 flex justify-center items-center">
              {typeof icon === 'string'
                ? <span className="text-base">{icon}</span>
                : color
                  ? React.createElement(icon, { size: 14, strokeWidth: 2, style: { color } })
                  : React.createElement(icon, { size: 14, strokeWidth: 2, className: 'text-muted-foreground' })}
            </div>
            <div className="font-pixel text-xs text-foreground">{value}</div>
            <div className="font-body text-[9px] text-muted-foreground mt-0.5">{labelNode ?? label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CafeUpgradePanel({ state, onClose }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-0 z-50 w-72 rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
      style={getFocusPanelStyle()}
    >
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-sm text-foreground">Upgrades</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="font-body text-[11px] text-muted-foreground mb-3">Expand and improve your cafe.</p>

      <div className="flex flex-col gap-2">
        {CAFE_UPGRADES.map((upg) => {
          const isUnlocked = state.reputation >= upg.repReq;
          return (
            <div
              key={upg.name}
              className={`rounded-lg border p-3 flex items-start gap-3 transition-colors ${
                isUnlocked
                  ? 'border-border/40 bg-secondary/30'
                  : 'border-border/20 bg-secondary/10 opacity-40'
              }`}
            >
              <span className="text-xl mt-0.5">{isUnlocked ? upg.icon : '🔒'}</span>
              <div className="flex-1 min-w-0">
                <div className="font-pixel text-xs text-foreground">{upg.name}</div>
                <div className="font-body text-[10px] text-muted-foreground mt-0.5 leading-snug">{upg.desc}</div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="font-pixel text-[12px] text-yellow-400 flex items-center gap-0.5">
                    <Coins size={11} strokeWidth={2.5} className="text-yellow-400" /> {upg.cost}
                  </span>
                  {!isUnlocked && (
                    <span className="font-pixel text-[9px] text-muted-foreground">Rep {upg.repReq}+ needed</span>
                  )}
                </div>
              </div>
              {isUnlocked && (
                <button
                  disabled
                  className="shrink-0 self-center rounded-md px-2 py-1 font-pixel text-[9px] bg-primary/10 text-primary border border-primary/20 opacity-60 cursor-not-allowed"
                >
                  Soon™
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// Lite Statistics popup — the full charts, viewable mid-session without
// leaving the cafe. Anchored above its footer button like CafeStatsPanel.
// Stat cards and the daily goal render live; only the weekly chart (the
// expensive recharts tree) is a static snapshot — the refresh button
// redraws it on demand.
function StatsPopup({ onClose, anchorRef }) {
  const { state } = useGame();
  const [weeklySnapshot, setWeeklySnapshot] = useState(state.stats.weeklyData);

  // Close on clicks outside the anchor wrapper (which contains both the
  // trigger button and this panel) — checking only the panel would race
  // the button's own toggle: mousedown closes, click reopens.
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, anchorRef]);

  return (
    <div
      className="absolute bottom-12 right-0 z-50 w-[26rem] max-h-[70vh] overflow-y-auto rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
      style={getFocusPanelStyle()}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-sm text-foreground">Statistics</h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setWeeklySnapshot(state.stats.weeklyData)}
            title="Redraw chart"
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <StatsCharts hideGoalReset weeklySnapshot={weeklySnapshot} />
    </div>
  );
}

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
      style={getFocusPanelStyle()}
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
  const isPaused = state.focus.status === 'paused';

  // Pausing freezes the AI's internal score accumulation at the source —
  // otherwise it drifts in the background and snaps the game score on resume.
  useEffect(() => {
    setAIScoreFrozen(isPaused);
  }, [isPaused]);
  const isManagement = state.phase === 'management';
  const [showBgModePanel, setShowBgModePanel] = useState(false);
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showStatsPopup, setShowStatsPopup] = useState(false);
  const statsPopupAnchorRef = useRef(null);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showPetShop, setShowPetShop] = useState(false);
  const [showModePrompt, setShowModePrompt] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  // Adjust-during-render: if the session ends underneath the exit dialog
  // (e.g. an auto-fail), drop the flag so the prompt can't strand over the
  // summary or resurface on the next session.
  if (showExitConfirm && !isFocusing) setShowExitConfirm(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupClosing, setPopupClosing] = useState(false);
  // The "still going" nudge has its own cooldown; danger bypasses cooldowns;
  // chaos is announced by a debounced escalation alert (below) so a run of
  // stage-ups collapses into a single notification for the highest stage.
  const stillGoingCooldownRef = useRef(false);
  const stillGoingCooldownTimerRef = useRef(null);
  const chaosNotifTimerRef = useRef(null);
  const blurNotifTimerRef = useRef(null);
  // Track previous values so the alert effects below fire only on a genuine
  // edge (chaos climbing / the danger clock starting), even across sessions.
  const prevChaosLevelRef = useRef(0);
  const prevWarningStartRef = useRef(null);
  // True once we've alerted for the current danger episode; reset when the
  // danger clock clears, so a phone flicker (or repeated leaves) can't re-fire.
  const dangerAlertedRef = useRef(false);
  const focusActiveRef = useRef(false);
  const popupRef = useRef(null);
  const popupCheckRef = useRef(null);
  const wasZenRef = useRef(false);
  const focusViewMode = state.settings?.focusViewMode ?? null;
  const isZenMode = isFocusing && focusViewMode === 'zen';
  const currentAiMode = state.settings?.aiMode ?? 'browser';
  const [popupPicture] = useState(() => ZEN_PICTURES[Math.floor(Math.random() * ZEN_PICTURES.length)]);

  useEffect(() => {
    const unsub = onAttentionEvent((event) => {
      processAIEvent(event);
    });
    return unsub;
  }, [processAIEvent]);

  // Deps intentionally limited to the status transition: adding the audio
  // values would replay the one-shot finish sound when volume changes while
  // the status is still 'completed'.
  useEffect(() => {
    if (state.focus.status === 'distracted') {
      Sounds.sessionFinishFail(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionFinishFail);
      dispatch({ type: 'END_FOCUS' });
    }
    if (state.focus.status === 'completed') {
      Sounds.sessionFinishDone(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionFinishDone);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.focus.status, dispatch]);

  // ก้อนที่ 1: จัดการ AI (เปิด-ปิด กล้องและโมเดล)
  // ==========================================
  useEffect(() => {
    if (!isFocusing) return; // ถ้าไม่ได้อยู่ในโหมดโฟกัส ก็ไม่ต้องเปิด AI

    startAttentionFeed(); // สั่งเปิดกล้องและเริ่มประมวลผล

    return () => {
      stopAttentionFeed(); // ปิด AI เมื่อออกจากโหมดโฟกัส
    };
  }, [isFocusing]); // <-- กุญแจสำคัญ! ทำงานแค่ตอน isFocusing เปลี่ยนค่าเท่านั้น


  // ==========================================
  // ก้อนที่ 2: จัดการระบบคาเฟ่ (ลูกค้าเดินเข้า-ออก, Event ต่างๆ)
  // ==========================================
  useEffect(() => {
    if (!isFocusing || state.focus.status === 'paused') return;

    // 1. ลูกค้าเข้าและออกร้าน
    const customerInterval = setInterval(() => {
      if (state.cafe.currentCustomers < state.cafe.maxCustomers && Math.random() < 0.3) {
        const sittable = state.cafe.furniture.filter(f => FURNITURE_CATALOG[f.type]?.sittable);
        const occupiedIds = new Set(state.npcs.customers.map(c => c.seatedAt).filter(Boolean));
        const freeSeat = sittable.find(f => !occupiedIds.has(f.id));
        const cat = freeSeat ? FURNITURE_CATALOG[freeSeat.type] : null;
        const standingSpot = freeSeat ? null : findRandomOpenSpot(CAFE_W / 2, CAFE_H / 2, CUSTOMER_RADIUS, state.cafe.furniture);

        if (freeSeat || standingSpot) {
          dispatch({
            type: 'ADD_CUSTOMER',
            payload: {
              id: `cust-${Date.now()}`,
              x: freeSeat ? freeSeat.x + freeSeat.w / 2 + (cat?.seatDx ?? 0) : standingSpot.x,
              y: freeSeat ? freeSeat.y + freeSeat.h / 2 + (cat?.seatDy ?? 0) : standingSpot.y,
              seatedAt: freeSeat?.id ?? null,
              color: CUSTOMER_COLORS[Math.floor(Math.random() * CUSTOMER_COLORS.length)],
              emoji: CUSTOMER_EMOJIS[Math.floor(Math.random() * CUSTOMER_EMOJIS.length)],
              arrivedAt: Date.now(),
            },
          });
        } else {
          dispatch({ type: 'CUSTOMER_TURNED_AWAY' });
        }
      }

      if (state.npcs.customers.length > 0 && Math.random() < 0.15) {
        const leaving = state.npcs.customers[Math.floor(Math.random() * state.npcs.customers.length)];
        if (leaving) {
          // The messier the cafe, the likelier a customer gives up and leaves
          // unserved (calm → always served; Midnight Incident → usually not).
          const unservedChance = [0, 0.15, 0.4, 0.75][state.attention.chaosLevel] ?? 0;
          const served = Math.random() >= unservedChance;
          dispatch({ type: served ? 'SERVE_CUSTOMER' : 'REMOVE_CUSTOMER', payload: leaving.id });
        }
      }
    }, 4000);

    // 2. สุ่มเกิด Chaos Event
    const chaosInterval = setInterval(() => {
      if (state.attention.chaosLevel > 0 && Math.random() < 0.2 * state.attention.chaosLevel) {
        const msg = generateChaosEvent(state.attention.chaosLevel);
        dispatch({ type: 'ADD_CHAOS_EVENT', payload: { message: msg, timestamp: Date.now() } });
      }
    }, 6000);

    return () => {
      clearInterval(customerInterval);
      clearInterval(chaosInterval);
    };
  // ตัวแปรที่ใช้เช็คว่าต้องรันโค้ดก้อนนี้ใหม่เมื่อไหร่ (ไม่ต้องใส่ dispatch ก็ได้ แต่ใส่ไว้ก็ไม่เป็นไร)
  }, [isFocusing, state.focus.status, state.cafe.currentCustomers, state.cafe.maxCustomers, state.npcs.customers, state.cafe.furniture, state.attention.chaosLevel, dispatch]);
  const requestNotifPermission = () => {
    if (!NOTIF_SUPPORTED) return;
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  };

  // Fire an OS notification only while the cafe tab is backgrounded (hidden or
  // unfocused) — the alert is redundant when you're already watching the cafe.
  // No-op without granted permission; try/catch swallows mobile browsers that
  // reject the plain Notification constructor (they require a service worker).
  // Returns true only if a notification was actually shown (permission granted
  // and the tab is backgrounded), so callers can dedupe per event.
  const fireBackgroundNotification = useCallback((body) => {
    if (!NOTIF_SUPPORTED || Notification.permission !== 'granted') return false;
    // The status popup is a separate window — while it's open the user is
    // watching it, not the main tab, so treat the main tab as backgrounded.
    const popupIsOpen = !!(popupRef.current && !popupRef.current.closed);
    if (!popupIsOpen && !document.hidden && document.hasFocus()) return false;
    try {
      const notif = new Notification('Lunaria Cafe ☕', { body, icon: '/favicon.svg' });
      notif.onclick = () => { window.focus(); };
      return true;
    } catch { /* mobile without a service worker */ return false; }
  }, []);

  const startFocusSession = () => {
    if (focusViewMode === null) {
      setShowModePrompt(true);
      return;
    }
    requestNotifPermission();
    Sounds.sessionStart(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionStart);
    dispatch({ type: 'SET_PHASE', payload: 'focus' });
    dispatch({ type: 'START_FOCUS' });
  };

  const handleModeSelect = (mode) => {
    dispatch({ type: 'SET_FOCUS_VIEW_MODE', payload: mode });
    setShowModePrompt(false);
    requestNotifPermission();
    Sounds.sessionStart(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionStart);
    dispatch({ type: 'SET_PHASE', payload: 'focus' });
    dispatch({ type: 'START_FOCUS' });
  };

  // Abandon any running session and return to the main menu. RESET_FOCUS
  // records nothing, so no streak is earned (coins/focus-time already banked).
  const exitToMenu = () => {
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
    toast.dismiss();
    // Immersive mode forces night only while focusing; leaving mid-session must
    // restore day, otherwise the menu is stuck on Nightfall — CafeView unmounts
    // before its timeOfDay effect can revert. (Reallife/freestyle set their own.)
    if ((state.cafe.bgMode ?? 'freestyle') === 'immersive') {
      dispatch({ type: 'SET_TIME_OF_DAY', payload: 'day' });
    }
    dispatch({ type: 'SET_PHASE', payload: 'menu' });
    dispatch({ type: 'RESET_FOCUS' });
  };

  const toggleFocusViewMode = () => {
    dispatch({ type: 'SET_FOCUS_VIEW_MODE', payload: focusViewMode === 'zen' ? 'game' : 'zen' });
  };


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

  // Background alert — chaos escalating. Refs update every render so no false
  // edge fires at session start (where chaosLevel may carry over). The alert
  // is debounced so a rapid run of stage-ups (e.g. 1→2→3) collapses into ONE
  // notification for the highest stage reached, instead of stacking.
  useEffect(() => {
    const level = state.attention.chaosLevel;
    const prev = prevChaosLevelRef.current;
    prevChaosLevelRef.current = level;
    if (!isFocusing || level <= prev || level < 1) return;
    if (chaosNotifTimerRef.current) clearTimeout(chaosNotifTimerRef.current);
    chaosNotifTimerRef.current = setTimeout(() => {
      chaosNotifTimerRef.current = null;
      const current = prevChaosLevelRef.current; // highest stage reached by now
      if (current >= 1) {
        fireBackgroundNotification(`Chaos is rising — ${CHAOS_STAGE_NAMES[current] ?? 'Chaos'}! Your cafe needs you.`);
      }
    }, 1500);
  }, [state.attention.chaosLevel, isFocusing, fireBackgroundNotification]);

  // Background alert — the shared 30s danger clock just started (phone in view
  // or score bottomed out). Fires at most once per danger episode: the clock
  // clearing re-arms it, so a flickering phone can't stack alerts.
  useEffect(() => {
    const start = state.attention.phoneWarningStart;
    const prev = prevWarningStartRef.current;
    prevWarningStartRef.current = start;
    if (!start) { dangerAlertedRef.current = false; return; } // episode ended → re-arm
    if (isFocusing && !prev && !dangerAlertedRef.current) {   // null → set edge
      if (fireBackgroundNotification(`${DANGER_SECONDS} seconds to refocus, or the session fails!`)) {
        dangerAlertedRef.current = true;
      }
    }
  }, [state.attention.phoneWarningStart, isFocusing, fireBackgroundNotification]);

  useEffect(() => {
    wasZenRef.current = isZenMode;
  }, [isZenMode]);

  const openStatusPopup = () => {
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.focus();
      return;
    }
    popupRef.current = window.open(
      '/',
      'cafe-status-popup',
      'width=380,height=460,popup=true,left=80,top=80',
    );
    setPopupOpen(true);

    // Poll until the user closes the popup window.
    popupCheckRef.current = setInterval(() => {
      if (popupRef.current?.closed) {
        clearInterval(popupCheckRef.current);
        popupRef.current = null;
        setPopupOpen(false);
        setPopupClosing(true);
        setTimeout(() => setPopupClosing(false), 800);
      }
    }, 500);
  };

  // Keep a ref to the latest state so the broadcast interval never needs to restart.
  const broadcastDataRef = useRef({});
  useEffect(() => {
  broadcastDataRef.current = {
    coins: state.coins,
    reputation: state.reputation,
    customers: state.cafe.currentCustomers,
    maxCustomers: state.cafe.maxCustomers,
    attentionScore: state.attention.score,
    chaosLevel: state.attention.chaosLevel,
    performanceMode: state.settings.performanceMode,
    phoneWarningStart: state.attention.phoneWarningStart,
    phoneDetected: state.attention.phoneDetected,
    userPresent: state.attention.userPresent,
    warningMessage: state.attention.warningMessage,
    phones: state.attention.phones,
    elapsed: state.focus.elapsed,
    status: state.focus.status,
    themeMode: getThemeMode(),
    dayHex: getThemeHex('day'),
    nightHex: getThemeHex('night'),
    dayShadeHex: getGlassShadeHex('day'),
    nightShadeHex: getGlassShadeHex('night'),
    timeOfDay: state.cafe?.timeOfDay ?? 'day',
  };
  });

  // Broadcast live state to the popup window via BroadcastChannel.
  // Channel is created once per focus session; data is read from the ref each tick.
  useEffect(() => {
    if (!isFocusing) return;
    const channel = new BroadcastChannel('cafe-status');
    channel.postMessage(broadcastDataRef.current); // immediate first push
    const interval = setInterval(() => channel.postMessage(broadcastDataRef.current), 2000);
    return () => { clearInterval(interval); channel.close(); };
  }, [isFocusing]);

  // Popup state resets when the focus session ends (adjust-during-render).
  const [prevIsFocusing, setPrevIsFocusing] = useState(isFocusing);
  if (prevIsFocusing !== isFocusing) {
    setPrevIsFocusing(isFocusing);
    if (!isFocusing) {
      setPopupOpen(false);
      setPopupClosing(false);
    }
  }

  // Clean up the popup window when the focus session ends.
  useEffect(() => {
    if (!isFocusing) {
      clearInterval(popupCheckRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      popupRef.current = null;
      // Drop any pending chaos alert so it can't fire after the session ends.
      if (chaosNotifTimerRef.current) { clearTimeout(chaosNotifTimerRef.current); chaosNotifTimerRef.current = null; }
    }
  }, [isFocusing]);

  // Keep ref in sync so the visibility handler always sees the current status.
  // Reset both notification cooldowns on each new session so they don't carry over.
  useEffect(() => {
    focusActiveRef.current = state.focus.status === 'active';
    if (state.focus.status === 'active') {
      stillGoingCooldownRef.current = false;
      dangerAlertedRef.current = false;
      if (stillGoingCooldownTimerRef.current) { clearTimeout(stillGoingCooldownTimerRef.current); stillGoingCooldownTimerRef.current = null; }
      if (chaosNotifTimerRef.current) { clearTimeout(chaosNotifTimerRef.current); chaosNotifTimerRef.current = null; }
    }
  }, [state.focus.status]);

  // Close popup and dismiss toasts when CafeView unmounts (e.g. back to menu via any path).
  useEffect(() => {
    return () => {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      if (chaosNotifTimerRef.current) clearTimeout(chaosNotifTimerRef.current);
      toast.dismiss();
    };
  }, []);

  // Native "Leave site?" dialog when closing/refreshing during an active session.
  // pagehide fires after the user confirms leaving — use it to clean up the popup and toasts.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!focusActiveRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePageHide = () => {
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      toast.dismiss();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []); // stable — reads runtime state via refs

  // Notification when user leaves during an active session.
  // Fires on tab-hide (visibilitychange) AND on app-switch (window blur — covers extended/mirrored displays).
  // OS notifications are tried if permission is granted (macOS can silently block them).
  // On desktop an in-app toast is also shown as a reliable fallback.
  // Both are skipped entirely on mobile/tablet where popup windows don't work.
  useEffect(() => {
    // Arm a 60s anti-spam window on the given cooldown ref pair.
    const armCooldown = (flagRef, timerRef) => {
      flagRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => { flagRef.current = false; timerRef.current = null; }, 60_000);
    };

    const fireNotif = () => {
      if (!focusActiveRef.current) return;
      if (IS_MOBILE_OR_TABLET) return;

      // Danger is time-critical and fires on every leave. Chaos is NOT fired
      // here — it's owned by the debounced escalation alert above, so leaving
      // mid-chaos never stacks a leave-time alert on top of the stage alert.
      const danger = Boolean(broadcastDataRef.current.phoneWarningStart);
      const chaos  = broadcastDataRef.current.chaosLevel ?? 0;

      let body;
      if (danger) {
        if (dangerAlertedRef.current) return; // already alerted this danger episode
        dangerAlertedRef.current = true;
        body = `${DANGER_SECONDS} seconds to refocus, or the session fails!`;
      } else if (chaos >= 1) {
        return; // announced by the debounced chaos escalation effect
      } else {
        if (stillGoingCooldownRef.current) return;
        armCooldown(stillGoingCooldownRef, stillGoingCooldownTimerRef);
        body = 'The cafe is still going! Click to check in.';
      }

      // Try OS notification
      if (NOTIF_SUPPORTED && Notification.permission === 'granted') {
        const notif = new Notification('Lunaria Cafe ☕', { body, icon: '/favicon.svg' });
        notif.onclick = () => { window.focus(); openStatusPopup(); };
      }

      // The "minimize" hint toast only belongs with the generic "still going"
      // nudge — a danger alert shouldn't drag it along.
      if (danger) return;

      // In-app toast — desktop only (mobile/tablet already returned above).
      let notifHint;
      if (!NOTIF_SUPPORTED || Notification.permission !== 'granted') {
        if (IS_MAC)          notifHint = 'Allow notifications in Chrome and in macOS System Settings → Notifications → Chrome to get OS-level alerts.';
        else if (IS_WINDOWS) notifHint = 'Allow notifications in Chrome and in Windows Settings → System → Notifications → Chrome to get OS-level alerts.';
        else                 notifHint = 'Allow notifications in your browser and system settings to get OS-level alerts.';
      }
      if (notifHint) {
        toast.custom((id) => (
          <div className="rounded-xl border border-border/50 bg-card text-foreground shadow-lg px-4 py-3 w-[356px] space-y-2">
            <p className="font-body text-sm font-semibold">Cafe window can be minimized too!</p>
            <p className="font-body text-xs text-muted-foreground">{notifHint}</p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={() => toast.dismiss(id)}
                className="w-full rounded-md border border-border/40 px-3 py-1.5 text-xs font-body text-foreground hover:bg-muted/50 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => { openStatusPopup(); toast.dismiss(id); }}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-body text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open popup
              </button>
            </div>
          </div>
        ), { id: 'minimize-hint', duration: 10_000 });
      } else {
        toast.custom((id) => (
          <div className="rounded-xl border border-border/50 bg-card text-foreground shadow-lg px-4 py-3 w-[356px] space-y-2">
            <p className="font-body text-sm font-semibold">Cafe window can be minimized too!</p>
            <div className="flex flex-col gap-1.5 pt-1">
              <button
                onClick={() => toast.dismiss(id)}
                className="w-full rounded-md border border-border/40 px-3 py-1.5 text-xs font-body text-foreground hover:bg-muted/50 transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => { openStatusPopup(); toast.dismiss(id); }}
                className="w-full rounded-md bg-primary px-3 py-1.5 text-xs font-body text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Open popup
              </button>
            </div>
          </div>
        ), { id: 'minimize-hint', duration: 10_000 });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      // Cancel any pending blur timer — visibilitychange is more authoritative
      if (blurNotifTimerRef.current) { clearTimeout(blurNotifTimerRef.current); blurNotifTimerRef.current = null; }
      fireNotif();
    };

    // Fires when the user switches to another application (extended/mirrored display, screen share).
    // visibilityState stays 'visible' in those cases, so we need window blur as a second trigger.
    // A 1.5s grace period filters out momentary focus losses (dock clicks, OS dialogs, etc.).
    const handleWindowBlur = () => {
      if (blurNotifTimerRef.current) return; // already pending
      blurNotifTimerRef.current = setTimeout(() => {
        blurNotifTimerRef.current = null;
        // Only fire if the tab is still visible (if hidden, visibilitychange already handled it)
        if (document.visibilityState === 'hidden') return;
        fireNotif();
      }, 1500);
    };

    const handleWindowFocus = () => {
      if (blurNotifTimerRef.current) { clearTimeout(blurNotifTimerRef.current); blurNotifTimerRef.current = null; }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      if (blurNotifTimerRef.current) { clearTimeout(blurNotifTimerRef.current); blurNotifTimerRef.current = null; }
    };
  }, []); // stable — reads runtime state via refs

  const timeOfDay   = state.cafe?.timeOfDay ?? 'day';
  const isImmersive = getThemeMode() === 'custom';
  const shadeHex    = getGlassShadeHex(timeOfDay);

  // Focus glass: opaque mix over a fixed backdrop tone so the bars keep
  // their brightness however dark --background goes behind them.
  const focusGlassBg =
    `color-mix(in srgb, color-mix(in srgb, var(--primary) 18%, var(--card)) 55%, ${FOCUS_GLASS_BASE})`;
  const glassHeaderBg = isImmersive ? getGlassGradient(timeOfDay, 'to bottom') : focusGlassBg;
  const glassFooterBg = isImmersive ? getGlassGradient(timeOfDay, 'to top')    : focusGlassBg;

  // Focus theme: lift footer buttons off the dark glass (immersive tint has its own contrast).
  const footerBtnClass = `gap-2 font-pixel text-xs ${isImmersive ? '' : 'bg-white/15 hover:bg-white/25 border-white/20'}`;

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: isImmersive ? shadeHex : 'var(--background)' }}>
      {isFocusing && <PhoneWarning />}
      {isFocusing && <LowScoreWarning />}
      <header
        className="relative shrink-0 z-20 flex items-center justify-between px-4 py-1.5 border-b-[3px] border-border/30"
        style={{
          backdropFilter: 'blur(32px) saturate(200%) brightness(1.25)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%) brightness(1.25)',
          background: glassHeaderBg,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 4px 24px rgba(0,0,0,0.22)',
        }}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              // Mid-session, confirm first — leaving forfeits the streak.
              if (isFocusing) setShowExitConfirm(true);
              else exitToMenu();
            }}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-display text-sm text-foreground">{state.cafe.name}</h1>
          <span className="font-pixel text-xs px-2 py-0.5 rounded-full bg-black/20 text-white/90 border border-white/30">
            {isManagement ? 'Management' : 'Focus'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isFocusing && <span style={{ display: 'inline-block', transform: 'translateX(5vw)', whiteSpace: 'nowrap' }}><FocusTimer compact /></span>}
          {/* Inner wrapper: relative so the journal button can overflow downward only */}
          <div className="relative flex items-center gap-2">
            {/* Invisible spacer reserves the journal button's width in the flex flow */}
            <div style={{ width: 63, height: 0, flexShrink: 0 }} aria-hidden="true" />
            <NPCPanel />
            <button
              type="button"
              onClick={() => setShowJournal(true)}
              title="Open journal"
              style={{ position: 'absolute', left: '70%', top: '135%', width: 63, height: 63, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              <img
                src={JOURNAL_BUTTON_ART}
                alt=""
                aria-hidden="true"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                className="drop-shadow-md transition-transform hover:scale-105"
              />
            </button>
          </div>
        </div>
      </header>

      {showJournal && (
        <JournalPanel
          journal={state.journal}
          dispatch={dispatch}
          onClose={() => setShowJournal(false)}
        />
      )}

      {showPetShop && (
        <PetShopPanel onClose={() => { Sounds.petShopClose(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxPetShopClose); setShowPetShop(false); }} />
      )}

      <main
        className="relative flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto"
        style={(isImmersive && !isZenMode && !popupOpen)
          ? {
              backgroundImage: `url(${timeOfDay === 'day' ? '/C_BG_Daylight.png' : '/C_BG_Nightfall.png'})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
            }
          : {}
        }
      >
        {isZenMode && !popupOpen && !isImmersive && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <div className="relative">
              <CafeCanvas frozen={true} />
              <div className="absolute inset-0 rounded-xl bg-background" />
            </div>
          </div>
        )}
        {(popupOpen || isZenMode) && isImmersive && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url(${timeOfDay === 'day' ? '/C_BG_Daylight.png' : '/C_BG_Nightfall.png'})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center center',
              filter: 'blur(6px)',
            }}
          />
        )}
        <AnimatePresence mode="wait">
          {popupClosing ? (
            <motion.div
              key="restoring"
              className="flex flex-col items-center justify-center gap-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="font-pixel text-xs text-muted-foreground">Reloading cafe view...</p>
            </motion.div>
          ) : popupOpen ? (
            <motion.div
              key="popup-placeholder"
              className="flex flex-col items-center justify-center gap-6 text-center"
              style={{ position: 'relative', zIndex: 1 }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <img
                src={popupPicture.src}
                alt={popupPicture.alt}
                className="rounded-2xl shadow-xl"
                style={{ maxHeight: '220px', imageRendering: 'pixelated' }}
              />
              <div className="space-y-2">
                <p className="font-pixel text-sm text-primary">(´• ω •`) ☕</p>
                <p className="font-display text-base text-foreground">
                  Your cafe is in a pop-out window!
                </p>
                <p className="font-body text-xs text-muted-foreground">
                  Close the window to bring the view back here~
                </p>
              </div>
            </motion.div>
          ) : isZenMode ? (
            <ZenFocusView key="zen" state={state} />
          ) : (
            <motion.div
              key="canvas"
              className="relative shrink-0"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6 }}
            >
              <CafeCanvas />
              <ParticleOverlay />
              <ChaosGauge />
              <ChaosEventLog />
              <GameFeedback />
              <DecoratePanel />
            </motion.div>
          )}
        </AnimatePresence>
        {isFocusing && !popupOpen && currentAiMode === 'browser' && <AttentionCamera />}
      </main>

      <footer
        className="shrink-0 z-30 px-4 py-3 border-t-[3px] border-border/30"
        style={{
          backdropFilter: 'blur(32px) saturate(200%) brightness(1.25)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%) brightness(1.25)',
          background: glassFooterBg,
          boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.45), inset 0 0 0 0.5px rgba(255,255,255,0.12), 0 -6px 28px rgba(0,0,0,0.22)',
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CafeHUD />
          <div className="flex flex-wrap gap-2 ml-auto">
            {isManagement && !state.cafe.decorateMode && (
              <>
              {/* Stats button */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowStatsPanel(v => !v); setShowUpgradePanel(false); }}
                  title="Cafe stats"
                >
                  <BarChart2 className="w-4 h-4" />
                </Button>
                {showStatsPanel && (
                  <CafeStatsPanel state={state} onClose={() => setShowStatsPanel(false)} />
                )}
              </div>

              {/* Upgrade button */}
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => { setShowUpgradePanel(v => !v); setShowStatsPanel(false); }}
                  title="Upgrades"
                >
                  <Store className="w-4 h-4" />
                </Button>
                {showUpgradePanel && (
                  <CafeUpgradePanel state={state} onClose={() => setShowUpgradePanel(false)} />
                )}
              </div>

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
                  className={footerBtnClass}
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
                  className={footerBtnClass}
                  onClick={() => { Sounds.petShopOpen(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxPetShopOpen); setShowPetShop(true); }}
                >
                  <PawPrint className="w-3.5 h-3.5" />
                  Pet Shop
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className={footerBtnClass}
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
                {/* Statistics popup */}
                <div className="relative" ref={statsPopupAnchorRef}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-2 font-pixel text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => setShowStatsPopup(v => !v)}
                    title="Statistics"
                  >
                    <BarChart3 className="w-3.5 h-3.5" /> Stats
                  </Button>
                  {showStatsPopup && (
                    <StatsPopup onClose={() => setShowStatsPopup(false)} anchorRef={statsPopupAnchorRef} />
                  )}
                </div>

                {/* Mode toggle */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 font-pixel text-xs text-muted-foreground hover:text-foreground"
                  onClick={toggleFocusViewMode}
                  title={focusViewMode === 'zen' ? 'Switch to Game Mode' : 'Switch to Zen Mode'}
                >
                  {focusViewMode === 'zen'
                    ? <><Gamepad2 className="w-3.5 h-3.5" /> Game Mode</>
                    : <><Sparkles className="w-3.5 h-3.5" /> Zen Mode</>}
                </Button>

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
                  onClick={() => { Sounds.sessionFinishDone(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionFinishDone); dispatch({ type: 'END_FOCUS' }); }}
                >
                  <Square className="w-3.5 h-3.5" />
                  Stop Focus
                </Button>
              </>
            )}
          </div>
        </div>
      </footer>
      <AnimatePresence>{showModePrompt && <FocusModePrompt onSelect={handleModeSelect} />}</AnimatePresence>
      <AnimatePresence>
        {showExitConfirm && (
          <ExitSessionPrompt
            onCancel={() => setShowExitConfirm(false)}
            onConfirm={() => { setShowExitConfirm(false); exitToMenu(); }}
          />
        )}
      </AnimatePresence>
      <SessionSummary />
    </div>
  );
}
