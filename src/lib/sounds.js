const FILES = [
  'session_start.mp3',
  'session_finish(done).mp3',
  'session_finish(fail).mp3',
  'petShop_open.mp3',
  'petShop_close.mp3',
  'Journal_opening.mp3',
  'journal_closing.mp3',
  'warning-sound.mp3',
  'debugtool_open.mp3',
];

const cache = {};

function getAudio(filename) {
  if (!cache[filename]) {
    const audio = new Audio(`/assets/sounds/${filename}`);
    audio.preload = 'auto';
    cache[filename] = audio;
  }
  return cache[filename];
}

let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  FILES.forEach((f) => {
    const a = getAudio(f);
    a.muted = true;
    a.play().then(() => { a.pause(); a.muted = false; a.currentTime = 0; }).catch(() => {});
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true });
}

function play(filename, sfxVolume = 0.7, masterVolume = 0.8, enabled = true) {
  if (!enabled) return;
  try {
    const audio = getAudio(filename);
    audio.volume = Math.min(1, sfxVolume * masterVolume);
    audio.currentTime = 0;
    audio.play().catch((err) => console.warn(`[Sound] "${filename}":`, err));
  } catch (err) {
    console.warn(`[Sound] "${filename}":`, err);
  }
}

export const Sounds = {
  sessionStart:      (sfx, master, enabled) => play('session_start.mp3', sfx, master, enabled),
  sessionFinishDone: (sfx, master, enabled) => play('session_finish(done).mp3', sfx, master, enabled),
  sessionFinishFail: (sfx, master, enabled) => play('session_finish(fail).mp3', sfx, master, enabled),
  petShopOpen:       (sfx, master, enabled) => play('petShop_open.mp3', sfx, master, enabled),
  petShopClose:      (sfx, master, enabled) => play('petShop_close.mp3', sfx, master, enabled),
  journalOpen:       (sfx, master, enabled) => play('Journal_opening.mp3', sfx, master, enabled),
  journalClose:      (sfx, master, enabled) => play('journal_closing.mp3', sfx, master, enabled),
  phoneWarning:      (sfx, master, enabled) => play('warning-sound.mp3', sfx, master, enabled),
  debugToolOpen:     (sfx, master, enabled) => play('debugtool_open.mp3', sfx, master, enabled),
};
