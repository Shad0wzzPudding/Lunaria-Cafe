import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { FURNITURE_CATALOG } from '@/lib/cafe/furnitureCatalog.js';
import {
  startAttentionFeed,
  stopAttentionFeed,
  onAttentionEvent,
  generateChaosEvent,
  getAIConfig,
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
import { ArrowLeft, Play, Sofa, Sparkles, Square, Pause, Wand2, X, BarChart2, Store, Coins, Sprout, Coffee, Moon, Star, Crown, PawPrint, Gamepad2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import SessionSummary from '@/components/cafe/SessionSummary';
import JournalPanel from '@/components/cafe/JournalPanel';
import PetShopPanel from '@/components/cafe/PetShopPanel';
import FocusModePrompt from '@/components/cafe/FocusModePrompt';
import ZenFocusView, { ZEN_PICTURES } from '@/components/cafe/ZenFocusView';
import { Sounds } from '@/lib/sounds';
import { toast } from 'sonner';

const IS_MAC          = navigator.userAgent.includes('Mac');
const IS_WINDOWS      = navigator.userAgent.includes('Win');
const NOTIF_SUPPORTED = typeof Notification !== 'undefined';
// iPadOS 13+ in desktop mode reports as Mac but has touch points
const IS_MOBILE_OR_TABLET = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  || (IS_MAC && navigator.maxTouchPoints > 1);

const JOURNAL_BUTTON_ART = '/assets/journal-button.png';

const CUSTOMER_COLORS = ['#6b7db3', '#7db36b', '#b36b7d', '#b3a06b', '#6bb3a0', '#a06bb3'];
const CUSTOMER_EMOJIS = ['😊', '😌', '🤓', '📖', '☕', '🧙', '🦊', '🌙'];

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

  // Stats to display - can be expanded with more interesting metrics later
  const stats = [
    { icon: '👥', label: 'Customers',   value: state.stats?.customersTotal ?? 0 },
    { icon: '☕', label: 'Sessions',    value: state.stats?.totalSessions ?? 0 },
    { icon: '🔥', label: 'Streak',      value: `${state.stats?.currentStreak ?? 0}d` },
    { icon: '⏱️', label: 'Focus Time',  value: `${state.stats?.totalFocusMinutes ?? 0}m` },
    { icon: Coins, label: 'Coins Earned',value: state.stats?.coinsEarned ?? 0 },
    { icon: '🌀', label: 'Chaos Events',value: state.stats?.chaosEvents ?? 0 },
  ];

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 right-10 z-50 w-80 rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
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

        <div className="flex justify-between items-end mb-3">
          {REPUTATION_TIERS.map((tier) => {
            const isCurrent = tier.name === currentTier.name;
            const isLocked = reputation < tier.min;
            return (
              <div key={tier.name} className="flex flex-col items-center gap-1 flex-1">
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
        {stats.map(({ icon, label, value }) => (
          <div key={label} className="rounded-lg bg-secondary/30 border border-border/20 p-2 text-center">
            <div className="mb-0.5 flex justify-center items-center">
              {typeof icon === 'string'
                ? <span className="text-base">{icon}</span>
                : React.createElement(icon, { size: 14, strokeWidth: 2, className: 'text-muted-foreground' })}
            </div>
            <div className="font-pixel text-xs text-foreground">{value}</div>
            <div className="font-body text-[9px] text-muted-foreground mt-0.5">{label}</div>
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
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showPetShop, setShowPetShop] = useState(false);
  const [showModePrompt, setShowModePrompt] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupClosing, setPopupClosing] = useState(false);
  const notifCooldownRef = useRef(false);
  const focusActiveRef = useRef(false);
  const popupRef = useRef(null);
  const popupCheckRef = useRef(null);
  const focusViewMode = state.settings?.focusViewMode ?? null;
  const isZenMode = isFocusing && focusViewMode === 'zen';
  const popupPicture = useRef(ZEN_PICTURES[Math.floor(Math.random() * ZEN_PICTURES.length)]).current;

  useEffect(() => {
    const unsub = onAttentionEvent((event) => {
      processAIEvent(event);
    });
    return unsub;
  }, [processAIEvent]);

  useEffect(() => {
    if (state.focus.status === 'distracted') {
      Sounds.sessionFinishFail(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionFinishFail);
      dispatch({ type: 'END_FOCUS' });
    }
    if (state.focus.status === 'completed') {
      Sounds.sessionFinishDone(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxSessionFinishDone);
    }
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
  broadcastDataRef.current = {
    coins: state.coins,
    reputation: state.reputation,
    customers: state.cafe.currentCustomers,
    maxCustomers: state.cafe.maxCustomers,
    attentionScore: state.attention.score,
    chaosLevel: state.attention.chaosLevel,
    phoneDetected: state.attention.phoneDetected,
    userPresent: state.attention.userPresent,
    warningMessage: state.attention.warningMessage,
    phones: state.attention.phones,
    elapsed: state.focus.elapsed,
    status: state.focus.status,
  };

  // Broadcast live state to the popup window via BroadcastChannel.
  // Channel is created once per focus session; data is read from the ref each tick.
  useEffect(() => {
    if (!isFocusing) return;
    const channel = new BroadcastChannel('cafe-status');
    channel.postMessage(broadcastDataRef.current); // immediate first push
    const interval = setInterval(() => channel.postMessage(broadcastDataRef.current), 2000);
    return () => { clearInterval(interval); channel.close(); };
  }, [isFocusing]);

  // Clean up popup when the focus session ends.
  useEffect(() => {
    if (!isFocusing) {
      clearInterval(popupCheckRef.current);
      if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
      popupRef.current = null;
      setPopupOpen(false);
      setPopupClosing(false);
    }
  }, [isFocusing]);

  // Keep ref in sync so the visibility handler always sees the current status.
  useEffect(() => {
    focusActiveRef.current = state.focus.status === 'active';
  }, [state.focus.status]);

  // Native "Leave site?" dialog when closing/refreshing during an active session.
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (!focusActiveRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []); // stable — reads runtime state via focusActiveRef

  // Notification when user switches tabs during an active session.
  // OS notifications are tried if permission is granted (macOS can silently block them).
  // On desktop an in-app toast is also shown as a reliable fallback.
  // Both are skipped entirely on mobile/tablet where popup windows don't work.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'hidden') return;
      if (!focusActiveRef.current) return;
      if (notifCooldownRef.current) return;
      if (IS_MOBILE_OR_TABLET) return;

      notifCooldownRef.current = true;
      setTimeout(() => { notifCooldownRef.current = false; }, 60_000);

      // Try OS notification
      if (NOTIF_SUPPORTED && Notification.permission === 'granted') {
        const notif = new Notification('Lunaria Cafe ☕', {
          body: 'The cafe is still going! Click to check in.',
          icon: '/favicon.svg',
        });
        notif.onclick = () => { window.focus(); openStatusPopup(); };
      }

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
        ), { duration: 10_000 });
      } else {
        toast('Cafe window can be minimized too!', {
          action: {
            label: 'Open popup',
            onClick: openStatusPopup,
          },
          cancel: {
            label: 'Dismiss',
          },
          duration: 10_000,
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []); // stable — reads runtime state via refs

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      {isFocusing && <PhoneWarning />}
      {isFocusing && <LowScoreWarning />}
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
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowJournal(true)}
            className="relative h-11 w-11 overflow-visible rounded-lg bg-transparent p-0 hover:bg-transparent"
            title="Open journal"
          >
            <img
              src={JOURNAL_BUTTON_ART}
              alt=""
              aria-hidden="true"
              className="h-11 w-11 object-contain drop-shadow-md transition-transform group-hover/button:scale-105"
            />
          </Button>
          <NPCPanel />
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

      <main className="relative flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
        {isZenMode && !popupOpen && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
            <div className="relative">
              <CafeCanvas frozen={true} />
              <div className="absolute inset-0 rounded-xl bg-background" />
            </div>
          </div>
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
        {isFocusing && !popupOpen && (getAIConfig().aiMode === 'browser' || getAIConfig().useLiveAI) && <AttentionCamera />}
      </main>

      <footer className="shrink-0 z-30 px-4 py-3 border-t border-border/30 bg-card/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.35)]">
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
                  onClick={() => { Sounds.petShopOpen(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxPetShopOpen); setShowPetShop(true); }}
                >
                  <PawPrint className="w-3.5 h-3.5" />
                  Pet Shop
                </Button>
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
      <SessionSummary />
    </div>
  );
}
