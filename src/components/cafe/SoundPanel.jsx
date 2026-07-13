import { useEffect, useRef } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { Switch } from '@/components/ui/switch';
import { X, Music, CloudRain, Flame, MessageSquare } from 'lucide-react';
import { getFocusPanelStyle } from '@/lib/theme/themeDeriver';
import { MUSIC_TRACKS } from '@/lib/audio/cafeAudioEngine';

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
 * In-cafe sound controls — music track choice and the ambience beds, the two
 * things worth changing without leaving the cafe. Volume sliders and the
 * per-SFX toggles stay in Settings. Anchored above its footer button, opening
 * to the right since the button sits on the left edge.
 */
export default function SoundPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const { audio } = state;
  const panelRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const setAudio = (updates) => dispatch({ type: 'SET_AUDIO', payload: updates });

  return (
    <div
      ref={panelRef}
      className="absolute bottom-14 left-0 z-50 w-72 rounded-xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-4"
      style={getFocusPanelStyle()}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm text-foreground">Sound</h3>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
  );
}
