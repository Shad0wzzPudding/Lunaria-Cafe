/** Royalty-free previews from Mixkit (https://mixkit.co) */
const SOURCES = {
  music: 'https://assets.mixkit.co/music/preview/mixkit-sparse-lazy-day-168.mp3',
  rain: 'https://assets.mixkit.co/sfx/preview/mixkit-light-rain-loop-1249.mp3',
  fire: 'https://assets.mixkit.co/sfx/preview/mixkit-campfire-crackles-1330.mp3',
  chatter: 'https://assets.mixkit.co/sfx/preview/mixkit-restaurant-crowd-talking-ambience-1213.mp3',
};

function createLoop(id, src) {
  const el = new Audio(src);
  el.loop = true;
  el.preload = 'auto';
  el.id = id;
  el.volume = 0;
  return el;
}

let tracks = null;
let sfxCtx = null;
let unlocked = false;

function ensureTracks() {
  if (tracks) return tracks;
  tracks = {
    music: createLoop('music', SOURCES.music),
    rain: createLoop('rain', SOURCES.rain),
    fire: createLoop('fire', SOURCES.fire),
    chatter: createLoop('chatter', SOURCES.chatter),
  };
  return tracks;
}

function ensureSfxCtx() {
  if (!sfxCtx) {
    sfxCtx = new AudioContext();
  }
  return sfxCtx;
}

export async function unlockCafeAudio() {
  const t = ensureTracks();
  if (unlocked) return;
  unlocked = true;

  const ctx = ensureSfxCtx();
  if (ctx.state === 'suspended') {
    await ctx.resume();
  }

  await Promise.all(
    Object.values(t).map(
      (el) =>
        el
          .play()
          .then(() => {
            el.pause();
            el.currentTime = 0;
          })
          .catch(() => {}),
    ),
  );
}

function playTrack(el, volume, enabled = true) {
  if (!enabled || volume <= 0.001) {
    el.pause();
    return;
  }
  el.volume = Math.min(1, volume);
  if (el.paused) {
    el.play().catch(() => {});
  }
}

export function updateCafeAudio(audio, phase) {
  if (!unlocked) return;
  const t = ensureTracks();
  const phaseMul = phase === 'management' || phase === 'focus' ? 1 : 0.25;
  const master = audio.masterVolume * phaseMul;

  playTrack(t.music, master * audio.musicVolume, true);
  playTrack(t.rain, master * audio.ambienceVolume, audio.rainEnabled);
  playTrack(t.fire, master * audio.ambienceVolume * 0.85, audio.fireplaceEnabled);
  playTrack(t.chatter, master * audio.ambienceVolume * 0.7, audio.chatterEnabled);
}

export async function playCoinChime(sfxVolume = 0.7, masterVolume = 0.8) {
  try {
    const ctx = ensureSfxCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.value = 0.22 * sfxVolume * masterVolume;
    gain.connect(ctx.destination);

    const playTone = (freq, start, duration) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.001, now + start);
      g.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + duration);
      osc.connect(g);
      g.connect(gain);
      osc.start(now + start);
      osc.stop(now + start + duration + 0.05);
    };

    playTone(880, 0, 0.12);
    playTone(1174.66, 0.08, 0.18);
    playTone(1567.98, 0.14, 0.22);
  } catch {
    /* ignore */
  }
}

export function stopAllCafeAudio() {
  if (!tracks) return;
  Object.values(tracks).forEach((el) => {
    el.pause();
    el.currentTime = 0;
  });
}
