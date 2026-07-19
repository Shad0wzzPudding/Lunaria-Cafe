import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Volume2, Music, Sparkles, LogOut, Camera, Cpu, Play, CheckCircle, XCircle, ShoppingBag, BookOpen, AlertTriangle, ChevronDown, Coins, Zap, Palette, Mail } from 'lucide-react';
import ThemePicker from '@/components/settings/ThemePicker';
import {
  setAIConfig,
  onConnectionStatus,
  isBrowserAISupported,
} from '@/lib/ai/aiIntegration';
import { useAuth } from '@/auth/useAuth';
import { PANEL_BRIGHT_BG } from '@/lib/theme/themeDeriver';

function AudioSlider({ icon: Icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-2 w-36 shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground/80 font-body">{label}</span>
      </span>
      <Slider
        value={Math.round(value * 100)}
        onValueChange={(v) => onChange((Array.isArray(v) ? v[0] : v) / 100)}
        max={100}
        step={1}
        className="flex-1"
      />
      <span className="font-pixel text-xs text-muted-foreground w-10 text-right">{Math.round(value * 100)}%</span>
    </div>
  );
}

function ToggleSetting({ icon: Icon, label, description, checked, onCheckedChange }) {
  return (
    <div className="flex items-center justify-between py-2 w-full">
      <span className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
        <span>
          <span className="block text-sm text-foreground/80 font-body">{label}</span>
          {description ? <span className="block text-xs text-muted-foreground">{description}</span> : null}
        </span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export default function GameSettings() {
  const { state, dispatch, saveNow, saveError, logout } = useGame();
  const { user, isGuest } = useAuth();
  const { audio } = state;
  const [aiStatus, setAiStatus] = useState({ status: 'offline', detail: '' });
  const [justSaved, setJustSaved] = useState(false);
  const savedTimerRef = useRef(null);

  useEffect(() => onConnectionStatus(setAiStatus), []);
  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  const handleSaveNow = async () => {
    const ok = await saveNow();
    if (!ok) return;
    setJustSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setJustSaved(false), 2000);
  };

  const setAudio = (updates) => dispatch({ type: 'SET_AUDIO', payload: updates });
  const [sfxOpen, setSfxOpen] = useState(false);
  const saveAi = (updates) => {
    setAIConfig(updates);
    dispatch({ type: 'SET_SETTINGS', payload: updates });
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30"
        style={{ background: PANEL_BRIGHT_BG }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">Settings</h1>
      </header>

      <main className="max-w-lg mx-auto p-6 space-y-8">
        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Palette className="w-4 h-4 text-primary" /> Theme
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5">
            <ThemePicker />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-primary" /> Audio
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-5">
            <AudioSlider icon={Volume2} label="Master" value={audio.masterVolume} onChange={(v) => setAudio({ masterVolume: v })} />
            <AudioSlider icon={Music} label="Music" value={audio.musicVolume} onChange={(v) => setAudio({ musicVolume: v })} />
            <AudioSlider icon={Sparkles} label="Ambience" value={audio.ambienceVolume} onChange={(v) => setAudio({ ambienceVolume: v })} />
            <AudioSlider icon={Volume2} label="SFX" value={audio.sfxVolume} onChange={(v) => setAudio({ sfxVolume: v })} />
            <p className="text-xs text-muted-foreground pt-1 border-t border-border/30">
              Music track and ambience (rain, fireplace, chatter) live in the Sound panel in the cafe.
            </p>
          </div>
        </section>

        <section className="space-y-4">
          <button
            type="button"
            onClick={() => setSfxOpen((v) => !v)}
            className="w-full flex items-center justify-between text-left"
          >
            <h2 className="font-display text-base text-foreground flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-primary" /> Sound Effects
            </h2>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${sfxOpen ? 'rotate-180' : ''}`} />
          </button>
          {sfxOpen && (
            <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-2">
              <ToggleSetting icon={Coins}         label="Coin Chime"       checked={audio.sfxCoinChime}         onCheckedChange={(v) => setAudio({ sfxCoinChime: v })} />
              <ToggleSetting icon={Play}          label="Session Start"    checked={audio.sfxSessionStart}      onCheckedChange={(v) => setAudio({ sfxSessionStart: v })} />
              <ToggleSetting icon={CheckCircle}   label="Session Complete" checked={audio.sfxSessionFinishDone} onCheckedChange={(v) => setAudio({ sfxSessionFinishDone: v })} />
              <ToggleSetting icon={XCircle}       label="Session Failed"   checked={audio.sfxSessionFinishFail} onCheckedChange={(v) => setAudio({ sfxSessionFinishFail: v })} />
              <ToggleSetting icon={ShoppingBag}   label="Pet Shop Open"    checked={audio.sfxPetShopOpen}       onCheckedChange={(v) => setAudio({ sfxPetShopOpen: v })} />
              <ToggleSetting icon={ShoppingBag}   label="Pet Shop Close"   checked={audio.sfxPetShopClose}      onCheckedChange={(v) => setAudio({ sfxPetShopClose: v })} />
              <ToggleSetting icon={BookOpen}      label="Journal Open"     checked={audio.sfxJournalOpen}       onCheckedChange={(v) => setAudio({ sfxJournalOpen: v })} />
              <ToggleSetting icon={BookOpen}      label="Journal Close"    checked={audio.sfxJournalClose}      onCheckedChange={(v) => setAudio({ sfxJournalClose: v })} />
              <ToggleSetting icon={AlertTriangle} label="Phone Warning"    checked={audio.sfxPhoneWarning}      onCheckedChange={(v) => setAudio({ sfxPhoneWarning: v })} />
              <ToggleSetting icon={Mail}          label="License Letter"   checked={audio.sfxLetterOpen ?? true} onCheckedChange={(v) => setAudio({ sfxLetterOpen: v })} />
              <ToggleSetting icon={Sparkles}      label="Lulys Greeting"   checked={audio.sfxSlideIn ?? true}   onCheckedChange={(v) => setAudio({ sfxSlideIn: v })} />
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Integration
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-4">
            <p className="text-sm text-muted-foreground font-body">
              Choose how the AI attention system tracks your focus during study sessions.
            </p>

            <div className="space-y-2">
              <span className="text-xs text-muted-foreground">AI Mode</span>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => saveAi({ aiMode: 'simulation' })}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    state.settings.aiMode === 'simulation'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/40 bg-background text-muted-foreground hover:border-border'
                  }`}
                >
                  <Cpu className="w-4 h-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-body">Simulation</span>
                    <span className="block text-xs text-muted-foreground">Simulated attention events (no camera needed)</span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => saveAi({ aiMode: 'browser' })}
                  disabled={!isBrowserAISupported()}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    state.settings.aiMode === 'browser'
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/40 bg-background text-muted-foreground hover:border-border'
                  } ${!isBrowserAISupported() ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Camera className="w-4 h-4 shrink-0" />
                  <span>
                    <span className="block text-sm font-body">Browser AI</span>
                    <span className="block text-xs text-muted-foreground">
                      {isBrowserAISupported()
                        ? 'Real webcam tracking using MediaPipe + YOLOv8 (no server needed)'
                        : 'Not supported in this browser (camera access required)'}
                    </span>
                  </span>
                </button>
              </div>
            </div>

            <pre className="bg-secondary/40 rounded-lg p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
              {`Status: ${aiStatus.status}${aiStatus.detail ? `\n${aiStatus.detail}` : ''}${
                state.settings.aiMode === 'browser'
                  ? '\n\nBrowser AI uses your webcam directly.\nCamera permission will be requested when you start a focus session.'
                  : '\n\nSimulation mode — no camera or server needed.'
              }`}
            </pre>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" /> Performance
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-2">
            <ToggleSetting
              icon={Zap}
              label="Performance Mode"
              description="Reduces visual effects (mist blur, floor wisps) for better frame rate on lower-end devices."
              checked={!!state.settings.performanceMode}
              onCheckedChange={(v) => dispatch({ type: 'SET_SETTINGS', payload: { performanceMode: v } })}
            />
          </div>
        </section>

        {/* Developer section — hidden intentionally (secret debug tool)
        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-primary" /> Developer
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5">
            <ToggleSetting
              icon={AlertTriangle}
              label="Cheat code ready"
              description="Press Enter 3 times to enable, then input the sequence to open the debug panel."
              checked={!!easyDebug}
              onCheckedChange={setEasyDebug}
            />
          </div>
        </section>
        */}

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <LogOut className="w-4 h-4 text-primary" /> Account
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-4">
            {user?.email ? (
              <p className="text-sm text-muted-foreground font-body">
                Signed in as <span className="text-foreground">{user.email}</span>
              </p>
            ) : isGuest ? (
              <p className="text-sm text-muted-foreground font-body">
                Playing as <span className="text-foreground">Guest</span>
              </p>
            ) : null}
            {saveError && (
              <p className="text-sm text-amber-400">Save issue: {saveError}</p>
            )}
            <p className="flex flex-wrap gap-2">
              {!isGuest && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveNow}
                  disabled={justSaved}
                  className={justSaved ? 'gap-1 text-emerald-400' : undefined}
                >
                  {justSaved ? (
                    <>
                      <CheckCircle className="w-4 h-4" /> Saved
                    </>
                  ) : (
                    'Save now'
                  )}
                </Button>
              )}
              <Button type="button" variant="secondary" size="sm" onClick={logout}>
                Log out
              </Button>
            </p>
          </div>
        </section>
      </main>

    </div>
  );
}
