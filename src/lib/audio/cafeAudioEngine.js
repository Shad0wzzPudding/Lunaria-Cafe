/**
 * Local audio assets (public/assets/sounds).
 *
 * `gain` trims each source to a common loudness so the mix stays even — the
 * files are mastered at quite different levels (measured RMS in comments).
 * These can only attenuate: HTMLAudioElement.volume is capped at 1.0, so a
 * source that is too quiet has to be fixed in the file, not here.
 */
export const MUSIC_TRACKS = [
  { id: 0, label: 'Track 1', src: '/assets/sounds/music_bg1.m4a', gain: 0.68 }, // -16.3 dB
  { id: 1, label: 'Track 2', src: '/assets/sounds/music_bg2.m4a', gain: 1.0 },  // -19.6 dB — quietest, the reference
  { id: 2, label: 'Track 3', src: '/assets/sounds/music_bg3.m4a', gain: 0.48 }, // -13.3 dB
];

const AMBIENCE = {
  rain:    { src: '/assets/sounds/ambient_rain.m4a',     gain: 1.0 },  // -31.2 dB — the reference bed
  fire:    { src: '/assets/sounds/ambient_campfire.m4a', gain: 1.0 },  // -38.5 dB — sits under the rain by design
  chatter: { src: '/assets/sounds/ambient_chatter.m4a',  gain: 0.46 }, // -24.4 dB — hottest source, trimmed to match rain
};

function createLoop(src) {
  const el = new Audio(src);
  el.loop = true;
  el.preload = 'auto';
  el.volume = 0;
  return el;
}

let ambience = null;
let musicEl = null;
let musicIndex = -1; // track currently loaded into musicEl; -1 = none
let sfxCtx = null;
let unlocked = false;

// Remembered so unlocking can immediately apply the settings that were in
// effect before the first user gesture (otherwise nothing starts until the
// next phase/settings change).
let lastAudio = null;
let lastPhase = null;

function ensureAmbience() {
  if (!ambience) {
    ambience = {
      rain: createLoop(AMBIENCE.rain.src),
      fire: createLoop(AMBIENCE.fire.src),
      chatter: createLoop(AMBIENCE.chatter.src),
    };
  }
  return ambience;
}

function ensureMusicEl() {
  if (!musicEl) {
    musicEl = new Audio();
    musicEl.preload = 'auto';
    musicEl.volume = 0;
    // Only fires in shuffle mode — a pinned track has loop = true.
    musicEl.addEventListener('ended', () => loadTrack(pickNextTrack()));
  }
  return musicEl;
}

function ensureSfxCtx() {
  if (!sfxCtx) sfxCtx = new AudioContext();
  return sfxCtx;
}

/** A random track that isn't the one currently playing. */
function pickNextTrack() {
  if (MUSIC_TRACKS.length < 2) return 0;
  let next = musicIndex;
  while (next === musicIndex) {
    next = Math.floor(Math.random() * MUSIC_TRACKS.length);
  }
  return next;
}

function loadTrack(index) {
  const el = ensureMusicEl();
  if (musicIndex === index) return;
  musicIndex = index;
  el.src = MUSIC_TRACKS[index].src;
  if (el.volume > 0.001) el.play().catch(() => {});
}

function playTrack(el, volume, enabled = true) {
  if (!enabled || volume <= 0.001) {
    el.pause();
    return;
  }
  el.volume = Math.min(1, volume);
  if (el.paused) el.play().catch(() => {});
}

function applyAudio(audio, phase) {
  const amb = ensureAmbience();
  const music = ensureMusicEl();

  // The cafe is the focal point — everything else runs quiet in the background.
  const phaseMul = phase === 'management' || phase === 'focus' ? 1 : 0.25;
  const master = audio.masterVolume * phaseMul;

  const ambVol = master * audio.ambienceVolume;
  playTrack(amb.rain, ambVol * AMBIENCE.rain.gain, audio.rainEnabled);
  playTrack(amb.fire, ambVol * AMBIENCE.fire.gain, audio.fireplaceEnabled);
  playTrack(amb.chatter, ambVol * AMBIENCE.chatter.gain, audio.chatterEnabled);

  const shuffle = audio.musicTrack === 'shuffle';
  music.loop = !shuffle;
  if (musicIndex < 0) {
    loadTrack(shuffle ? Math.floor(Math.random() * MUSIC_TRACKS.length) : Number(audio.musicTrack) || 0);
  } else if (!shuffle && musicIndex !== Number(audio.musicTrack)) {
    loadTrack(Number(audio.musicTrack));
  }
  playTrack(music, master * audio.musicVolume * MUSIC_TRACKS[musicIndex].gain, audio.musicEnabled);
}

export function updateCafeAudio(audio, phase) {
  lastAudio = audio;
  lastPhase = phase;
  if (!unlocked) return;
  applyAudio(audio, phase);
}

export async function unlockCafeAudio() {
  if (unlocked) return;
  unlocked = true;

  const ctx = ensureSfxCtx();
  if (ctx.state === 'suspended') await ctx.resume();

  // Prime the loops inside the user gesture so later play() calls are allowed.
  await Promise.all(
    Object.values(ensureAmbience()).map((el) =>
      el
        .play()
        .then(() => {
          el.pause();
          el.currentTime = 0;
        })
        .catch(() => {}),
    ),
  );

  if (lastAudio) applyAudio(lastAudio, lastPhase);
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

// Each arrow maps to a distinct pitch like FNF note hits.
const PAD_FREQ = {
  ArrowLeft:  493.88,   // B4  — purple lane
  ArrowDown:  659.25,   // E5  — blue lane
  ArrowUp:    880.00,   // A5  — green lane
  ArrowRight: 1046.50,  // C6  — red lane
};
const PAD_FREQ_DEFAULT = 698.46; // F5 — b / a / Enter

export async function playDancePadNote(key = '', sfxVolume = 0.7, masterVolume = 0.8) {
  try {
    const ctx = ensureSfxCtx();
    if (ctx.state === 'suspended') await ctx.resume();

    const freq = PAD_FREQ[key] ?? PAD_FREQ_DEFAULT;
    const now  = ctx.currentTime;

    // Triangle wave gives the clean, hollow FNF-style "tick"
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.38 * sfxVolume * masterVolume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    /* ignore */
  }
}

export function stopAllCafeAudio() {
  if (musicEl) {
    musicEl.pause();
    musicEl.currentTime = 0;
  }
  if (!ambience) return;
  Object.values(ambience).forEach((el) => {
    el.pause();
    el.currentTime = 0;
  });
}
