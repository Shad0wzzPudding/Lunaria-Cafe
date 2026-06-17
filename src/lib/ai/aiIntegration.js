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
} from '@/lib/ai/browserAI';

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
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { aiMode: 'browser' };
    return { aiMode: 'browser', ...JSON.parse(raw) };
  } catch {
    return { aiMode: 'browser' };
  }
}

function saveConfig(updates) {
  const next = { ...loadConfig(), ...updates };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
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
    source: event.source ?? 'simulation',
  };
  listeners.forEach((cb) => cb(normalized));
  return normalized;
}

export function startSimulation() {
  if (simulationInterval) return;
  setConnectionStatus('live', 'simulation');

  simulationInterval = setInterval(() => {
    const drift = (Math.random() - 0.45) * 8;
    simulatedScore = Math.max(20, Math.min(100, simulatedScore + drift));
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
export function startAttentionFeed() {
  const { aiMode } = loadConfig();
  stopSimulation();
  stopBrowserTracking();

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

export function generateChaosEvent(level) {
  const events = {
    1: [
      '☕ Oops! A coffee cup tipped over!',
      '🐇 Mochi knocked over a sugar bowl!',
      '😅 A customer got the wrong drink!',
      '🧁 The muffins are a little burnt...',
      '💤 Cinnamon fell asleep on a table!',
    ],
    2: [
      '✨ A potion started bubbling over!',
      '💨 Magical smoke fills the kitchen!',
      '🦎 A tiny creature escaped its jar!',
      '🌀 The spell on the menu went haywire!',
      '🔮 Crystal ball started floating!',
    ],
    3: [
      '🌑 The cafe lights flickered mysteriously...',
      '🌀 A small portal appeared under a table!',
      '👻 Shadow wisps drifted through the walls...',
      '⚡ The moonstone glowed intensely!',
      '🌧️ It started raining inside the cafe!',
    ],
  };
  const pool = events[level] || events[1];
  return pool[Math.floor(Math.random() * pool.length)];
}
