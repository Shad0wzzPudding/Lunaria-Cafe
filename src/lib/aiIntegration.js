/**
 * AI Integration — connects Lunaria Cafe to focus tracking systems.
 *
 * Three modes:
 *   1. simulation — random attention drift (default, works everywhere)
 *   2. live       — polls a local Python FastAPI server
 *   3. browser    — runs MediaPipe + COCO-SSD directly in the browser
 *
 * Game event shape:
 * { phone_detected, attention_score (0-100), user_present, timestamp, warning_message?, tracker_score?, source }
 */

import {
  startBrowserAI,
  stopBrowserAI,
  isBrowserAISupported,
  getBrowserAIStatus,
} from '@/lib/browserAI';

const CONFIG_KEY = 'lunaria-ai-config';
const DEFAULT_API_URL = 'http://127.0.0.1:8000';
const POLL_MS = 500;

const listeners = new Set();
const statusListeners = new Set();

let simulatedScore = 85;
let simulationInterval = null;
let pollInterval = null;
let browserAIActive = false;
let browserVideoElement = null;
let connectionStatus = 'offline'; // offline | connecting | live | error
let liveAttentionScore = 85;

// aiMode: 'simulation' | 'live' | 'browser'
function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return { apiUrl: DEFAULT_API_URL, useLiveAI: false, aiMode: 'browser' };
    const parsed = { apiUrl: DEFAULT_API_URL, useLiveAI: false, aiMode: 'browser', ...JSON.parse(raw) };
    
    // migrate old useLiveAI flag
    if (parsed.useLiveAI && parsed.aiMode === 'simulation') {
      parsed.aiMode = 'live';
    }
    // migrate: treat 'simulation' as unset and force browser default
    if (parsed.aiMode === 'simulation') {
      parsed.aiMode = 'browser';
    }

    return parsed;
  } catch {
    return { apiUrl: DEFAULT_API_URL, useLiveAI: false, aiMode: 'browser' };
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

/**
 * Map Python TrackerState → game attention event (0–100 score).
 */
export function mapTrackerStateToEvent(trackerState) {
  const {
    is_phone_detected,
    is_face_detected,
    is_user_focused,
    focus_score,
    warning_message,
  } = trackerState;

  // Gradual score changes instead of preset patterns
  let targetScore = 85;
  if (is_phone_detected) {
    targetScore = 22;
  } else if (!is_face_detected) {
    targetScore = 38;
  } else if (!is_user_focused) {
    targetScore = 52;
  } else {
    const bonus = Math.min(30, Math.log1p(focus_score) * 4);
    targetScore = Math.min(100, 70 + bonus);
  }

  // Gradually move current score toward target
  const scoreDiff = targetScore - liveAttentionScore;
  const maxChange = 2.0; // Maximum change per tick
  if (Math.abs(scoreDiff) <= maxChange) {
    liveAttentionScore = targetScore;
  } else {
    liveAttentionScore += Math.sign(scoreDiff) * maxChange;
  }
  liveAttentionScore = Math.max(0, Math.min(100, liveAttentionScore));

  return {
    phone_detected: Boolean(is_phone_detected),
    attention_score: Math.round(liveAttentionScore),
    user_present: Boolean(is_face_detected),
    timestamp: Date.now(),
    warning_message: warning_message || '',
    tracker_score: focus_score,
    source: 'live',
  };
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

export async function checkAIHealth(apiUrl = loadConfig().apiUrl) {
  const base = apiUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { ok: true, data: await res.json() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function pollTrackerState() {
  const { apiUrl } = loadConfig();
  const base = apiUrl.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/state`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const trackerState = await res.json();
    setConnectionStatus('live');
    processAIEvent(mapTrackerStateToEvent(trackerState));
  } catch (err) {
    setConnectionStatus('error', err.message);
  }
}

/**
 * Poll the Python API for live camera / attention data.
 */
export function startLiveTracking() {
  if (pollInterval) return;
  setConnectionStatus('connecting');
  pollTrackerState();
  pollInterval = setInterval(pollTrackerState, POLL_MS);
}

export function stopLiveTracking() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  liveAttentionScore = 85;
  if (!simulationInterval) setConnectionStatus('offline');
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
  if (!pollInterval) setConnectionStatus('offline');
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
  if (!simulationInterval && !pollInterval) setConnectionStatus('offline');
}

export function getBrowserVideoElement() {
  return browserVideoElement;
}

/**
 * Start AI feed for focus sessions based on the configured mode.
 */
export function startAttentionFeed() {
  const { aiMode, useLiveAI } = loadConfig();
  stopSimulation();
  stopLiveTracking();
  stopBrowserTracking();

  if (aiMode === 'browser') {
    startBrowserTracking();
  } else if (aiMode === 'live' || useLiveAI) {
    startLiveTracking();
  } else {
    startSimulation();
  }
}

export function stopAttentionFeed() {
  stopSimulation();
  stopLiveTracking();
  stopBrowserTracking();
  setConnectionStatus('offline');
}

export { isBrowserAISupported, getBrowserAIStatus };

export function getStreamUrl(apiUrl = loadConfig().apiUrl) {
  return `${apiUrl.replace(/\/$/, '')}/stream`;
}

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
