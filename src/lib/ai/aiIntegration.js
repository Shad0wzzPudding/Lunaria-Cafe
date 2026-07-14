/**
 * AI Integration — connects Lunaria Cafe to focus tracking systems.
 *
 * Two modes:
 *   1. simulation — random attention drift (default, works everywhere)
 *   2. browser    — runs MediaPipe + COCO-SSD directly in the browser
 *
 * Game event shape:
 * { phone_detected, attention_score (0-100), user_present, timestamp, warning_message?, tracker_score?, source }
 */

import {
  startBrowserAI,
  stopBrowserAI,
  isBrowserAISupported,
  getBrowserAIStatus,
  setBrowserAIScoreFrozen,
} from '@/lib/ai/browserAI';
import { guestStorage } from '@/lib/guestStorage';

const CONFIG_KEY = 'lunaria-ai-config';

const listeners = new Set();
const statusListeners = new Set();

let simulatedScore = 85;
let simulationInterval = null;
let browserAIActive = false;
let browserVideoElement = null;
let connectionStatus = 'offline'; // offline | connecting | live | error

// aiMode: 'simulation' | 'browser'
function loadConfig() {
  try {
    const raw = guestStorage.getItem(CONFIG_KEY);
    if (!raw) return { aiMode: 'browser' };
    return { aiMode: 'browser', ...JSON.parse(raw) };
  } catch {
    return { aiMode: 'browser' };
  }
}

function saveConfig(updates) {
  const next = { ...loadConfig(), ...updates };
  guestStorage.setItem(CONFIG_KEY, JSON.stringify(next));
  return next;
}

export function getAIConfig() {
  return loadConfig();
}

export function setAIConfig(updates) {
  return saveConfig(updates);
}

function setConnectionStatus(status, detail = '') {
  connectionStatus = status;
  statusListeners.forEach((cb) => cb({ status, detail }));
}

export function onConnectionStatus(callback) {
  statusListeners.add(callback);
  callback({ status: connectionStatus, detail: '' });
  return () => statusListeners.delete(callback);
}

export function getConnectionStatus() {
  return connectionStatus;
}

export function onAttentionEvent(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function processAIEvent(event) {
  const normalized = {
    phone_detected: event.phone_detected ?? false,
    attention_score: Math.max(0, Math.min(100, event.attention_score ?? 85)),
    user_present: event.user_present ?? true,
    timestamp: event.timestamp ?? Date.now(),
    warning_message: event.warning_message ?? '',
    tracker_score: event.tracker_score,
    phones: event.phones ?? [],
    source: event.source ?? 'simulation',
  };
  listeners.forEach((cb) => cb(normalized));
  return normalized;
}

export function startSimulation() {
  if (simulationInterval) return;
  setConnectionStatus('live', 'simulation');

  simulationInterval = setInterval(() => {
    if (!scoreFrozen) {
      const drift = (Math.random() - 0.45) * 4;
      simulatedScore = Math.max(0, Math.min(100, simulatedScore + drift));
    }
    const phoneChance = Math.random() < 0.02;

    processAIEvent({
      phone_detected: phoneChance,
      attention_score: Math.round(simulatedScore),
      user_present: Math.random() > 0.01,
      timestamp: Date.now(),
      source: 'simulation',
    });
  }, 3000);
}

export function stopSimulation() {
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  if (!browserAIActive) setConnectionStatus('offline');
}

/**
 * Start browser-native AI tracking (MediaPipe + COCO-SSD).
 */
export async function startBrowserTracking() {
  if (browserAIActive) return;
  setConnectionStatus('connecting', 'Loading browser AI...');

  try {
    browserVideoElement = await startBrowserAI({
      onEvent: (event) => processAIEvent(event),
      onStatusChange: ({ status, detail }) => {
        if (status === 'active') setConnectionStatus('live', 'Browser AI');
        else if (status === 'error') setConnectionStatus('error', detail);
        else if (status === 'loading') setConnectionStatus('connecting', detail);
        // Still live — face and gaze tracking are fine — but part of the
        // pipeline (phone detection) failed to load, so carry the reason
        // instead of reporting a clean 'Browser AI'.
        else if (status === 'degraded') setConnectionStatus('live', detail);
      },
    });
    browserAIActive = true;
  } catch (err) {
    setConnectionStatus('error', err.message);
  }
}

export function stopBrowserTracking() {
  if (!browserAIActive) return;
  stopBrowserAI();
  browserAIActive = false;
  browserVideoElement = null;
  if (!simulationInterval) setConnectionStatus('offline');
}

export function getBrowserVideoElement() {
  return browserVideoElement;
}

/**
 * Start AI feed for focus sessions based on the configured mode.
 */
// Freeze the AI's internal score accumulation (game paused). Detection
// itself keeps running so resume has no model-restart cost; the emitted
// score simply holds its value until unfrozen.
let scoreFrozen = false;
export function setAIScoreFrozen(frozen) {
  scoreFrozen = frozen;
  setBrowserAIScoreFrozen(frozen);
}

export function startAttentionFeed() {
  const { aiMode } = loadConfig();
  stopSimulation();
  stopBrowserTracking();
  setAIScoreFrozen(false);

  if (aiMode === 'browser') {
    startBrowserTracking();
  } else {
    startSimulation();
  }
}

export function stopAttentionFeed() {
  stopSimulation();
  stopBrowserTracking();
  setConnectionStatus('offline');
}

export { isBrowserAISupported, getBrowserAIStatus };

export function getChaosStage(score) {
  if (score >= 70) return { level: 0, name: 'Calm', color: '#7ec8a0' };
  if (score >= 50) return { level: 1, name: 'Cute Chaos', color: '#f0c674' };
  if (score >= 30) return { level: 2, name: 'Magical Chaos', color: '#cc7ada' };
  return { level: 3, name: 'Midnight Incident', color: '#6b7db3' };
}

/**
 * Chaos gauge fill fraction (0..1) from the focus score, mapped so each stage
 * boundary lands on a gauge tick — matching the 3-segment art:
 *   entering stage 1 (score < 70) → 1/3 (first tick)
 *   entering stage 2 (score < 50) → 2/3 (second tick)
 *   entering stage 3 (score < 30) → 1   (full / end)
 * Within a stage the bar fills progressively toward the next tick.
 */
export function chaosGaugeFill(score) {
  const s = Math.max(0, Math.min(100, score));
  if (s >= 70) return (100 - s) / 30 / 3;        // stage 0: 0 → 1/3
  if (s >= 50) return 1 / 3 + (70 - s) / 20 / 3; // stage 1: 1/3 → 2/3
  if (s >= 30) return 2 / 3 + (50 - s) / 20 / 3; // stage 2: 2/3 → 1
  return 1;                                       // stage 3: full
}

export function generateChaosEvent(level) {
  const events = {
    1: [
      '☕ Oops! A coffee cup tipped over!',
      '🐇 Mochi knocked over a sugar bowl!',
      '😅 A customer got the wrong drink!',
      '🧁 The muffins are a little burnt...',
      '💤 Cinnamon fell asleep on a table!',
      '👻 A shy ghost peeked out from behind the bookshelf!',
      '👻 Something small and white is drifting near the ceiling...',
    ],
    2: [
      '✨ A potion started bubbling over!',
      '💨 Magical smoke fills the kitchen!',
      '🦎 A tiny creature escaped its jar!',
      '🌀 The spell on the menu went haywire!',
      '🔮 Crystal ball started floating!',
      '🔥 Eerie flames danced up from the floorboards!',
      '🔥 Spectral fires flickered to life in the corners...',
    ],
    3: [
      '🌑 The cafe lights flickered mysteriously...',
      '🌀 A small portal appeared under a table!',
      '👻 Shadow wisps drifted through the walls...',
      '⚡ The moonstone glowed intensely!',
      '🌧️ It started raining inside the cafe!',
      '🌫️ A thick purple mist is creeping across the floor...',
      '🌫️ The cafe smells of lavender and something unknown.',
    ],
  };
  const pool = events[level] || events[1];
  return pool[Math.floor(Math.random() * pool.length)];
}
