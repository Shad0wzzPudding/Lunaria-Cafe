import React, { useEffect, useState } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Volume2, Music, CloudRain, Flame, MessageSquare, Sparkles } from 'lucide-react';
import {
  getAIConfig,
  setAIConfig,
  checkAIHealth,
  onConnectionStatus,
} from '@/lib/aiIntegration';

function AudioSlider({ icon: Icon, label, value, onChange }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex items-center gap-2 w-36 shrink-0">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm text-foreground/80 font-body">{label}</span>
      </span>
      <Slider
        value={[value * 100]}
        onValueChange={([v]) => onChange(v / 100)}
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
  const { state, dispatch } = useGame();
  const { audio } = state;
  const [aiConfig, setAiConfigState] = useState(getAIConfig);
  const [aiStatus, setAiStatus] = useState({ status: 'offline', detail: '' });
  const [aiTesting, setAiTesting] = useState(false);

  useEffect(() => onConnectionStatus(setAiStatus), []);

  const setAudio = (updates) => dispatch({ type: 'SET_AUDIO', payload: updates });
  const saveAi = (updates) => setAiConfigState(setAIConfig(updates));
  const testAi = async () => {
    setAiTesting(true);
    const r = await checkAIHealth(aiConfig.apiUrl);
    setAiTesting(false);
    setAiStatus(r.ok ? { status: 'live', detail: 'Server reachable' } : { status: 'error', detail: r.error });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
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
            <Volume2 className="w-4 h-4 text-primary" /> Audio
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-5">
            <AudioSlider icon={Volume2} label="Master" value={audio.masterVolume} onChange={(v) => setAudio({ masterVolume: v })} />
            <AudioSlider icon={Music} label="Music" value={audio.musicVolume} onChange={(v) => setAudio({ musicVolume: v })} />
            <AudioSlider icon={Sparkles} label="Ambience" value={audio.ambienceVolume} onChange={(v) => setAudio({ ambienceVolume: v })} />
            <AudioSlider icon={Volume2} label="SFX" value={audio.sfxVolume} onChange={(v) => setAudio({ sfxVolume: v })} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> Ambience
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-2">
            <ToggleSetting icon={CloudRain} label="Rain Sounds" description="Soft rain on the windows" checked={audio.rainEnabled} onCheckedChange={(v) => setAudio({ rainEnabled: v })} />
            <ToggleSetting icon={Flame} label="Fireplace" description="Warm crackling fire" checked={audio.fireplaceEnabled} onCheckedChange={(v) => setAudio({ fireplaceEnabled: v })} />
            <ToggleSetting icon={MessageSquare} label="Cafe Chatter" description="Gentle background voices" checked={audio.chatterEnabled} onCheckedChange={(v) => setAudio({ chatterEnabled: v })} />
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-display text-base text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" /> AI Integration
          </h2>
          <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-5 space-y-4">
            <p className="text-sm text-muted-foreground font-body">
              Start the Python server in ai-server/, enable live AI, then run a focus session.
            </p>
            <label className="block space-y-1">
              <span className="text-xs text-muted-foreground">API URL</span>
              <input
                type="url"
                value={aiConfig.apiUrl}
                onChange={(e) => saveAi({ apiUrl: e.target.value })}
                className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
              />
            </label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Use live AI camera</span>
              <Switch checked={aiConfig.useLiveAI} onCheckedChange={(v) => saveAi({ useLiveAI: v })} />
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={testAi} disabled={aiTesting}>
              {aiTesting ? 'Testing…' : 'Test connection'}
            </Button>
            <pre className="bg-secondary/40 rounded-lg p-3 font-mono text-xs text-muted-foreground whitespace-pre-wrap">
              {`Status: ${aiStatus.status}\n${aiStatus.detail || ''}\n\nuvicorn focus_api:app --host 127.0.0.1 --port 8000`}
            </pre>
          </div>
        </section>
      </main>
    </div>
  );
}
