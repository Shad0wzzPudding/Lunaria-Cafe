import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGame } from '@/lib/gameState/useGame';
import { Switch } from '@/components/ui/switch';
import { X, Music, CloudRain, Flame, MessageSquare, Volume2, VolumeX } from 'lucide-react';
import { getFocusPanelStyle } from '@/lib/theme/themeDeriver';
import { MUSIC_TRACKS } from '@/lib/audio/cafeAudioEngine';

// Card width (w-72). The drawer parks itself exactly this far left so only
// the tab pokes out — keep the two in sync.
const CARD_W = 288;

function SoundToggle({ icon: Icon, label, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-body text-xs text-foreground/80 truncate">{label}</span>
      </span>
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

/**
 * Sound drawer — slides out from the left edge of the cafe, with a speaker tab
 * riding on its right edge as the handle. Holds the controls worth changing
 * mid-session (music track, ambience beds); volume sliders and per-SFX toggles
 * stay in Settings.
 */
export default function SoundPanel({ open, onOpenChange, muted }) {
  const { state, dispatch } = useGame();
  const { audio } = state;
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) onOpenChange(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onOpenChange]);

  const setAudio = (updates) => dispatch({ type: 'SET_AUDIO', payload: updates });

  return (
    <div ref={rootRef} className="absolute left-0 bottom-4 z-40">
      <motion.div
        className="flex items-end"
        initial={false}
        animate={{ x: open ? 0 : -CARD_W }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
      >
        {/* Parked off-screen when closed, so it must also leave the tab order —
            otherwise keyboard users land on switches they cannot see. */}
        <div
          inert={!open}
          className="w-72 rounded-r-xl border border-l-0 border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
          style={getFocusPanelStyle()}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-sm text-foreground">Sound</h3>
            <button
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <SoundToggle
            icon={Music}
            label="Background Music"
            checked={audio.musicEnabled}
            onCheckedChange={(v) => setAudio({ musicEnabled: v })}
          />

          {audio.musicEnabled && (
            <div className="grid grid-cols-4 gap-1.5 mt-2 mb-1">
              {[{ id: 'shuffle', label: 'Shuffle' }, ...MUSIC_TRACKS].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAudio({ musicTrack: t.id })}
                  className={`rounded-lg border px-1 py-1.5 font-pixel text-[10px] transition-colors ${
                    audio.musicTrack === t.id
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border/40 bg-secondary/30 text-muted-foreground hover:border-primary/40'
                  }`}
                >
                  {t.id === 'shuffle' ? 'Shuffle' : t.label.replace('Track ', '')}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3 pt-3 border-t border-border/30">
            <div className="font-pixel text-[10px] text-muted-foreground mb-1">Ambience</div>
            <SoundToggle
              icon={CloudRain}
              label="Rain"
              checked={audio.rainEnabled}
              onCheckedChange={(v) => setAudio({ rainEnabled: v })}
            />
            <SoundToggle
              icon={Flame}
              label="Fireplace"
              checked={audio.fireplaceEnabled}
              onCheckedChange={(v) => setAudio({ fireplaceEnabled: v })}
            />
            <SoundToggle
              icon={MessageSquare}
              label="Cafe Chatter"
              checked={audio.chatterEnabled}
              onCheckedChange={(v) => setAudio({ chatterEnabled: v })}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onOpenChange(!open)}
          aria-expanded={open}
          title={open ? 'Hide sound controls' : 'Sound'}
          className="flex h-11 w-8 items-center justify-center rounded-r-lg border border-l-0 border-border/50 bg-card/95 shadow-xl backdrop-blur-md text-muted-foreground hover:text-foreground transition-colors"
          style={getFocusPanelStyle()}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </motion.div>
    </div>
  );
}
