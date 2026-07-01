import { oklch, parse } from 'culori';
import { guestStorage } from '@/lib/guestStorage';

const KEY_DAY        = 'lunaria-theme-hex-day';
const KEY_NIGHT      = 'lunaria-theme-hex-night';
const KEY_MODE       = 'lunaria-theme-mode'; // 'custom' | 'classic'
const KEY_SHADE_DAY  = 'lunaria-glass-shade-day';
const KEY_SHADE_NIGHT= 'lunaria-glass-shade-night';

const DEFAULT_HEX    = { day: '#e2ae60', night: '#5A41AF' };
const DEFAULT_SHADE  = { day: '#cabb9b', night: '#2B213F' };

const storageGet    = (key)      => guestStorage.getItem(key);
const storageSet    = (key, val) => guestStorage.setItem(key, val);
const storageRemove = (key)      => guestStorage.removeItem(key);

function shadeStorageKey(timeOfDay) {
  return timeOfDay === 'night' ? KEY_SHADE_NIGHT : KEY_SHADE_DAY;
}

export function getGlassShadeHex(timeOfDay = 'day') {
  return storageGet(shadeStorageKey(timeOfDay)) ?? DEFAULT_SHADE[timeOfDay] ?? '#0a0a0a';
}

export function setGlassShadeHex(hex, timeOfDay = 'day') {
  storageSet(shadeStorageKey(timeOfDay), hex);
}

function storageKey(timeOfDay) {
  return timeOfDay === 'night' ? KEY_NIGHT : KEY_DAY;
}

export function deriveTheme(hex) {
  const parsed = parse(hex);
  if (!parsed) return null;

  const { l, c: rawC, h: rawH } = oklch(parsed);
  const h = rawH ?? 0;
  const c = Math.min(rawC ?? 0, 0.28);

  const pfg = l > 0.55
    ? `oklch(0.13 ${(c * 0.22).toFixed(3)} ${h})`
    : `oklch(0.97 0.005 ${h})`;

  const d   = (f) => (c * f).toFixed(3);
  const hOff = (deg) => ((h + deg + 360) % 360).toFixed(1);

  return {
    '--background':                `oklch(0.12 ${d(0.22)} ${h})`,
    '--foreground':                `oklch(0.93 0.02 ${h})`,
    '--card':                      `oklch(0.17 ${d(0.37)} ${h})`,
    '--card-foreground':           `oklch(0.93 0.02 ${h})`,
    '--popover':                   `oklch(0.17 ${d(0.37)} ${h})`,
    '--popover-foreground':        `oklch(0.93 0.02 ${h})`,
    '--primary':                   `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`,
    '--primary-foreground':        pfg,
    '--secondary':                 `oklch(0.24 ${d(0.52)} ${h})`,
    '--secondary-foreground':      `oklch(0.90 0.015 ${h})`,
    '--muted':                     `oklch(0.22 ${d(0.44)} ${h})`,
    '--muted-foreground':          `oklch(0.63 ${d(0.59)} ${h})`,
    '--accent':                    `oklch(0.24 ${d(0.52)} ${h})`,
    '--accent-foreground':         `oklch(0.90 0.015 ${h})`,
    '--destructive':               `oklch(0.65 0.22 25)`,
    '--destructive-foreground':    `oklch(0.97 0 0)`,
    '--border':                    `oklch(1 0 0 / 10%)`,
    '--input':                     `oklch(1 0 0 / 14%)`,
    '--ring':                      `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`,
    '--chart-1':                   `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`,
    '--chart-2':                   `oklch(${(l * 0.85).toFixed(3)} ${d(0.87)} ${hOff(-15)})`,
    '--chart-3':                   `oklch(${(l * 0.70).toFixed(3)} ${c.toFixed(3)} ${hOff(20)})`,
    '--chart-4':                   `oklch(${(l * 0.55).toFixed(3)} ${d(0.87)} ${hOff(-25)})`,
    '--chart-5':                   `oklch(${(l * 0.40).toFixed(3)} ${d(0.70)} ${h})`,
    '--sidebar':                   `oklch(0.15 ${d(0.33)} ${h})`,
    '--sidebar-foreground':        `oklch(0.93 0.02 ${h})`,
    '--sidebar-primary':           `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`,
    '--sidebar-primary-foreground': pfg,
    '--sidebar-accent':            `oklch(0.22 ${d(0.44)} ${h})`,
    '--sidebar-accent-foreground': `oklch(0.90 0.015 ${h})`,
    '--sidebar-border':            `oklch(1 0 0 / 10%)`,
    '--sidebar-ring':              `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h})`,
  };
}

const CLASSIC_VARS = (() => {
  const base = deriveTheme('#ffffff');
  return {
    ...base,
    '--background':        'oklch(0.08 0 0)',
    '--foreground':        'oklch(1 0 0)',
    '--card':              'oklch(0.12 0 0)',
    '--card-foreground':   'oklch(1 0 0)',
    '--popover':           'oklch(0.12 0 0)',
    '--popover-foreground': 'oklch(1 0 0)',
    '--secondary':         'oklch(0.16 0 0)',
    '--muted':             'oklch(0.14 0 0)',
    '--accent':            'oklch(0.16 0 0)',
    '--sidebar':           'oklch(0.10 0 0)',
    '--scrollbar-thumb':   'oklch(1 0 0)',
    '--scrollbar-hover':   'oklch(0.75 0 0)',
  };
})();

function getOrCreateStyleTag() {
  let el = document.getElementById('lunaria-theme-override');
  if (!el) {
    el = document.createElement('style');
    el.id = 'lunaria-theme-override';
    document.head.appendChild(el);
  }
  return el;
}

function injectVars(vars) {
  const rules = Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n');
  getOrCreateStyleTag().textContent = `.dark {\n${rules}\n}\n:root {\n${rules}\n}`;
}

// Save a hex for a given timeOfDay; only injects vars in custom mode.
export function applyTheme(hex, timeOfDay = 'day') {
  const vars = deriveTheme(hex);
  if (!vars) return false;
  storageSet(storageKey(timeOfDay), hex);
  if (getThemeMode() !== 'classic') injectVars(vars);
  return true;
}

// Read the saved hex for timeOfDay and apply it (no save).
export function applyThemeForTimeOfDay(timeOfDay = 'day') {
  if (getThemeMode() === 'classic') {
    injectVars(CLASSIC_VARS);
    return true;
  }
  const hex = getThemeHex(timeOfDay) ?? DEFAULT_HEX[timeOfDay];
  const vars = deriveTheme(hex);
  if (!vars) return false;
  injectVars(vars);
  return true;
}

export function getThemeHex(timeOfDay = 'day') {
  return storageGet(storageKey(timeOfDay)) ?? null;
}

export function getThemeMode() {
  return storageGet(KEY_MODE) ?? 'classic';
}

export function setThemeMode(mode) {
  storageSet(KEY_MODE, mode);
  if (mode === 'classic') {
    injectVars(CLASSIC_VARS);
  }
}

export function resetTheme(timeOfDay) {
  if (timeOfDay) {
    storageRemove(storageKey(timeOfDay));
  } else {
    storageRemove(KEY_DAY);
    storageRemove(KEY_NIGHT);
    storageRemove(KEY_SHADE_DAY);
    storageRemove(KEY_SHADE_NIGHT);
  }
  if (getThemeMode() === 'classic') {
    injectVars(CLASSIC_VARS);
  } else if (timeOfDay) {
    applyThemeForTimeOfDay(timeOfDay);
  } else {
    const el = document.getElementById('lunaria-theme-override');
    if (el) el.textContent = '';
  }
}

export function loadSavedTheme(timeOfDay = 'day') {
  return applyThemeForTimeOfDay(timeOfDay);
}

// Sync all theme settings from account save into localStorage then apply.
export function applyThemeSettings({ mode, dayHex, nightHex, dayShadeHex, nightShadeHex } = {}, timeOfDay = 'day') {
  if (mode         != null) storageSet(KEY_MODE,        mode);
  if (dayHex       != null) storageSet(KEY_DAY,         dayHex);
  if (nightHex     != null) storageSet(KEY_NIGHT,       nightHex);
  if (dayShadeHex  != null) storageSet(KEY_SHADE_DAY,   dayShadeHex);
  if (nightShadeHex!= null) storageSet(KEY_SHADE_NIGHT, nightShadeHex);
  applyThemeForTimeOfDay(timeOfDay);
}
