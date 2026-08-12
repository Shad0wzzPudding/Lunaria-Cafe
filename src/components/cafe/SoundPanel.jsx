import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '@/lib/gameState/useGame';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { X, Music, CloudRain, Flame, MessageSquare, Volume2, VolumeX, Sparkles } from 'lucide-react';
import { getFocusPanelStyle } from '@/lib/theme/themeDeriver';
import { MUSIC_TRACKS } from '@/lib/audio/cafeAudioEngine';

// Card width (w-72). The drawer parks itself exactly this far left so only
// the tab pokes out — keep the two in sync.
const CARD_W = 288;

const PAGES = [
  { id: 'toggles', label: 'Toggles' },
  { id: 'levels', label: 'Levels' },
];

// Horizontal page slide. `dir` is +1 going right→left (to Levels), -1 back.
// With AnimatePresence mode="popLayout" only the active page is in flow, so
// the panel height follows it and the inactive page never enters the tab order.
const SLIDE_VARIANTS = {
  enter:  (d) => ({ x: d > 0 ? '110%' : '-110%', opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit:   (d) => ({ x: d > 0 ? '-110%' : '110%', opacity: 0 }),
};

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

// Compact volume row sized for the narrow w-72 panel (label kept short so the
// slider keeps room) — the Settings AudioSlider is too wide to reuse here.
function SoundSlider({ icon: Icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="flex items-center gap-1.5 w-24 shrink-0">
        <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <span className="font-body text-xs text-foreground/80 truncate">{label}</span>
      </span>
      <Slider
        value={Math.round(value * 100)}
        onValueChange={(v) => onChange((Array.isArray(v) ? v[0] : v) / 100)}
        max={100}
        step={1}
        className="flex-1"
      />
      <span className="font-pixel text-[10px] text-muted-foreground w-8 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

/**
 * Sound drawer — slides out from the left edge of the cafe, with a speaker tab
 * riding on its right edge as the handle. Two pages you switch with the tabs:
 * "Toggles" (music/ambience on-off + track picker) and "Levels" (the four
 * volume sliders). The same controls also live in Settings.
 */
export default function SoundPanel({ open, onOpenChange, muted }) {
  const { state, dispatch } = useGame();
  const { audio } = state;
  const rootRef = useRef(null);
  const [page, setPage] = useState('toggles');
  const [dir, setDir] = useState(-1); // slide direction for the page transition

  const goTo = (id) => {
    setDir(id === 'levels' ? 1 : -1);
    setPage(id);
  };

  // Adjust-during-render (react.dev "storing information from previous
  // renders"): reopen on the first page rather than wherever it was left.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) { setPage('toggles'); setDir(-1); }
  }

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

          {/* Segmented tabs — switching slides the content across. */}
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {PAGES.map((pg) => (
              <button
                key={pg.id}
                type="button"
                onClick={() => goTo(pg.id)}
                aria-pressed={page === pg.id}
                className={`rounded-lg border px-2 py-1 font-pixel text-[10px] transition-colors ${
                  page === pg.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border/40 bg-secondary/30 text-muted-foreground hover:border-primary/40'
                }`}
              >
                {pg.label}
              </button>
            ))}
          </div>

          <div className="relative overflow-hidden">
            <AnimatePresence initial={false} custom={dir} mode="popLayout">
              <motion.div
                key={page}
                custom={dir}
                variants={SLIDE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              >
                {page === 'toggles' ? (
                  <div>
                    {/* Above the per-layer switches on purpose: music off still
                        leaves rain and chatter playing, which reads as a bug
                        unless there's one control that means silence. */}
                    <SoundToggle
                      icon={VolumeX}
                      label="Mute everything"
                      checked={audio.preMuteVolume != null}
                      onCheckedChange={() => dispatch({ type: 'TOGGLE_MUTE_ALL' })}
                    />
                    <div className="my-2 border-t border-border/30" />

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
                ) : (
                  <div>
                    <SoundSlider icon={Volume2}  label="Master"   value={audio.masterVolume}   onChange={(v) => setAudio({ masterVolume: v })} />
                    <SoundSlider icon={Music}    label="Music"    value={audio.musicVolume}    onChange={(v) => setAudio({ musicVolume: v })} />
                    <SoundSlider icon={Sparkles} label="Ambience" value={audio.ambienceVolume} onChange={(v) => setAudio({ ambienceVolume: v })} />
                    <SoundSlider icon={Volume2}  label="SFX"      value={audio.sfxVolume}      onChange={(v) => setAudio({ sfxVolume: v })} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
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
