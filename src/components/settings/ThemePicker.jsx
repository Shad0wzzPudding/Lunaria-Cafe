import { useState, useRef, useCallback, useEffect } from 'react';
import { applyTheme, resetTheme, applyThemeForTimeOfDay, getThemeHex, getThemeMode, setThemeMode, getGlassShadeHex, setGlassShadeHex, DEFAULT_HEX, DEFAULT_SHADE } from '@/lib/theme/themeDeriver';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGame } from '@/lib/gameState/useGame';

const PRESETS = {
  day: [
    { hex: '#dfaf66', label: 'Amber' },
    { hex: '#e8c87a', label: 'Gold' },
    { hex: '#7d5fde', label: 'Violet' },
    { hex: '#5ba4cf', label: 'Sky' },
    { hex: '#5fba7d', label: 'Sage' },
    { hex: '#de6b5f', label: 'Rose' },
    { hex: '#de9f5f', label: 'Peach' },
    { hex: '#c45fde', label: 'Magenta' },
  ],
  night: [
    { hex: '#5f6ede', label: 'Indigo' },
    { hex: '#7d5fde', label: 'Violet' },
    { hex: '#3d7abf', label: 'Deep Sky' },
    { hex: '#5fba7d', label: 'Teal' },
    { hex: '#de6b9f', label: 'Lilac' },
    { hex: '#8f5fde', label: 'Purple' },
    { hex: '#5faaaa', label: 'Cyan' },
    { hex: '#de5f7d', label: 'Rose' },
  ],
};

const DEFAULTS = DEFAULT_HEX;
const SHADE_DEFAULTS = DEFAULT_SHADE;

function isValidHex(str) {
  return /^#[0-9a-fA-F]{6}$/.test(str);
}

function SinglePicker({ timeOfDay, saveTheme }) {
  const saved    = getThemeHex(timeOfDay) ?? DEFAULTS[timeOfDay];
  const [hex, setHex]           = useState(saved);
  const [inputVal, setInputVal] = useState(saved.replace('#', '').toUpperCase());
  const [inputError, setInputError] = useState(false);
  const colorRef = useRef(null);

  const savedShade = getGlassShadeHex(timeOfDay);
  const [shadeHex, setShadeHex]         = useState(savedShade);
  const [shadeInput, setShadeInput]     = useState(savedShade.replace('#', '').toUpperCase());
  const [shadeError, setShadeError]     = useState(false);
  const shadeRef = useRef(null);

  const apply = useCallback((value) => {
    applyTheme(value, timeOfDay);
    setHex(value);
    setInputVal(value.replace('#', '').toUpperCase());
    setInputError(false);
    saveTheme(timeOfDay === 'day' ? { dayHex: value } : { nightHex: value });
  }, [timeOfDay, saveTheme]);

  const handleHexInput = (e) => {
    const raw  = e.target.value.replace('#', '').toUpperCase();
    setInputVal(raw);
    const full = '#' + raw;
    if (isValidHex(full)) {
      apply(full);
    } else {
      setInputError(raw.length === 6);
    }
  };

  const handleReset = () => {
    const defaultHex = DEFAULTS[timeOfDay];
    const defaultShade = SHADE_DEFAULTS[timeOfDay];
    resetTheme(timeOfDay);
    setGlassShadeHex(defaultShade, timeOfDay); // re-applies the theme itself in custom mode
    setHex(defaultHex);
    setInputVal(defaultHex.replace('#', '').toUpperCase());
    setInputError(false);
    setShadeHex(defaultShade);
    setShadeInput(defaultShade.replace('#', '').toUpperCase());
    setShadeError(false);
    saveTheme(timeOfDay === 'day'
      ? { dayHex: defaultHex, dayShadeHex: defaultShade }
      : { nightHex: defaultHex, nightShadeHex: defaultShade }
    );
  };

  const applyShade = useCallback((value) => {
    setGlassShadeHex(value, timeOfDay); // re-injects the theme itself (frame-coalesced)
    setShadeHex(value);
    setShadeInput(value.replace('#', '').toUpperCase());
    setShadeError(false);
    saveTheme(timeOfDay === 'day' ? { dayShadeHex: value } : { nightShadeHex: value });
  }, [timeOfDay, saveTheme]);

  const handleShadeInput = (e) => {
    const raw  = e.target.value.replace('#', '').toUpperCase();
    setShadeInput(raw);
    const full = '#' + raw;
    if (isValidHex(full)) {
      applyShade(full);
    } else {
      setShadeError(raw.length === 6);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {/* Color swatch → opens native picker */}
        <button
          type="button"
          className="relative w-10 h-10 rounded-lg border-2 border-white/20 shadow-md shrink-0 overflow-hidden hover:scale-105 transition-transform"
          style={{ backgroundColor: hex }}
          onClick={() => colorRef.current?.click()}
          title="Open color wheel"
        >
          <input
            ref={colorRef}
            type="color"
            value={hex}
            onChange={(e) => apply(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          />
        </button>

        {/* Hex input */}
        <div className={`flex flex-1 items-center gap-1.5 rounded-lg border px-3 py-2 bg-muted/30 transition-colors ${
          inputError ? 'border-destructive/60' : 'border-border/50'
        }`}>
          <span className="font-pixel text-sm text-muted-foreground">#</span>
          <input
            type="text"
            value={inputVal}
            onChange={handleHexInput}
            maxLength={6}
            placeholder={DEFAULTS[timeOfDay].replace('#', '').toUpperCase()}
            spellCheck={false}
            className="flex-1 bg-transparent font-pixel text-sm text-foreground outline-none uppercase tracking-widest placeholder:text-muted-foreground/40 min-w-0"
          />
          {inputError && (
            <span className="text-destructive text-[10px] font-pixel shrink-0">invalid</span>
          )}
        </div>

        {/* Reset */}
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={handleReset}
          title="Reset to default"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Presets */}
      <div className="flex flex-wrap gap-2">
        {PRESETS[timeOfDay].map(({ hex: ph, label }) => {
          const isSelected = hex.toUpperCase() === ph.toUpperCase();
          return (
            <button
              key={ph}
              type="button"
              onClick={() => apply(ph)}
              title={label}
              className="w-7 h-7 rounded-full transition-all hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{
                backgroundColor: ph,
                outline: isSelected ? `2px solid ${ph}` : 'none',
                outlineOffset: '2px',
                boxShadow: isSelected ? '0 0 0 3px rgba(255,255,255,0.2)' : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Glass fade color */}
      <div className="pt-1 space-y-2">
        <p className="font-pixel text-[10px] text-muted-foreground/70 uppercase tracking-wider">Glass fade color</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="relative w-8 h-8 rounded-lg border-2 border-white/20 shadow-md shrink-0 overflow-hidden hover:scale-105 transition-transform"
            style={{ backgroundColor: shadeHex }}
            onClick={() => shadeRef.current?.click()}
            title="Open shade color wheel"
          >
            <input
              ref={shadeRef}
              type="color"
              value={shadeHex}
              onChange={(e) => applyShade(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            />
          </button>
          <div className={`flex flex-1 items-center gap-1.5 rounded-lg border px-3 py-1.5 bg-muted/30 transition-colors ${
            shadeError ? 'border-destructive/60' : 'border-border/50'
          }`}>
            <span className="font-pixel text-xs text-muted-foreground">#</span>
            <input
              type="text"
              value={shadeInput}
              onChange={handleShadeInput}
              maxLength={6}
              spellCheck={false}
              className="flex-1 bg-transparent font-pixel text-xs text-foreground outline-none uppercase tracking-widest placeholder:text-muted-foreground/40 min-w-0"
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => applyShade(SHADE_DEFAULTS[timeOfDay])}
            title="Reset shade to default"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ThemePicker() {
  const { state, dispatch } = useGame();
  const [mode, setMode] = useState(getThemeMode);
  const [tab, setTab]   = useState('day');

  const cafeTimeOfDay = state.cafe?.timeOfDay ?? 'day';
  const cafeTimeOfDayRef = useRef(cafeTimeOfDay);
  useEffect(() => { cafeTimeOfDayRef.current = cafeTimeOfDay; });

  // Preview the selected tab's theme live; revert to cafe's actual time-of-day on leave.
  useEffect(() => {
    if (mode !== 'custom') return;
    applyThemeForTimeOfDay(tab);
    return () => { applyThemeForTimeOfDay(cafeTimeOfDayRef.current); };
  }, [tab, mode]);

  const saveTheme = useCallback((patch) => {
    dispatch({
      type: 'SET_SETTINGS',
      payload: { theme: { ...state.settings.theme, ...patch } },
    });
  }, [dispatch, state.settings.theme]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setThemeMode(newMode);
    saveTheme({ mode: newMode });
    if (newMode === 'custom') {
      const h = getThemeHex(tab) ?? DEFAULTS[tab];
      applyTheme(h, tab);
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex rounded-lg border border-border/40 overflow-hidden p-0.5 bg-muted/20">
        {[
          { id: 'classic', label: 'Focus' },
          { id: 'custom',  label: 'Immersive' },
        ].map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => handleModeChange(id)}
            className={`flex-1 py-1.5 font-pixel text-xs rounded-md transition-all ${
              mode === id
                ? 'bg-white text-black shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'classic' ? (
        <p className="text-xs font-pixel text-muted-foreground/70 py-1">
          Midnight purple theme, no background wallpaper. Switch to Immersive to set your own palette and have a background wallpaper.
        </p>
      ) : (
        <>
          {/* Day / Night tab switcher */}
          <div className="flex rounded-lg border border-border/40 overflow-hidden p-0.5 bg-muted/20">
            {[
              { id: 'day',   label: '☀️ Daylight' },
              { id: 'night', label: '🌙 Nightfall' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 py-1.5 font-pixel text-xs rounded-md transition-all ${
                  tab === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* key remounts the picker per tab so its state initializes from
              that tab's saved colors (replaces a sync-state effect) */}
          <SinglePicker key={tab} timeOfDay={tab} saveTheme={saveTheme} />

          <p className="text-[10px] font-pixel text-muted-foreground/60">
            Each theme applies automatically when the cafe switches between day and night.
          </p>
        </>
      )}
    </div>
  );
}
