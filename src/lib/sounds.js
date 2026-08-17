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
  'letter_opening.mp3',
  'slide_in.mp3',
  'lulys_presenting.mp3',
  'lulys_dismiss.mp3',
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

// Elements a real play() has claimed. The unlock priming below must not tidy
// up after itself on one of these, or it stops a sound the player asked for.
const claimed = new WeakSet();

let unlocked = false;
function unlock() {
  if (unlocked) return;
  unlocked = true;
  FILES.forEach((f) => {
    const a = getAudio(f);
    // Skip anything already claimed by a real play(), BEFORE muting it. The
    // guard inside the .then() only protects the cleanup; the mute here is
    // synchronous, so an element mid-playback when the first pointerdown lands
    // would be silenced on the spot — and then skipped by that same guard, so
    // nothing would ever unmute it and the clip would finish inaudibly.
    // Reachable whenever the first sound is not started by a mouse: Enter on
    // Start Session, or the phone warning firing off a timer, with the
    // player's first click landing while it plays.
    if (claimed.has(a)) return;
    a.muted = true;
    a.play().then(() => {
      // The priming play resolves ASYNCHRONOUSLY, once the file has buffered.
      // If a genuine play() claimed this element while that was in flight, the
      // cleanup below would pause it, rewind it, and leave the player hearing
      // nothing — which is exactly what happened on a cold load whose first
      // click opens a page that greets you. Leave claimed elements alone.
      if (claimed.has(a)) return;
      a.pause();
      a.muted = false;
      a.currentTime = 0;
    }).catch(() => {});
  });
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlock, { once: true });
}

function play(filename, sfxVolume = 0.7, masterVolume = 0.8, enabled = true) {
  if (!enabled) return;
  try {
    const audio = getAudio(filename);
    // Take this element back off unlock(): it mutes every cached element and
    // primes it, then pauses and rewinds when that resolves. Both halves have
    // to be undone — unmuting alone still leaves the sound to be paused a
    // moment later, which is what made this look fixed when it was not.
    claimed.add(audio);
    audio.muted = false;
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
  letterOpen:        (sfx, master, enabled) => play('letter_opening.mp3', sfx, master, enabled),
  slideIn:           (sfx, master, enabled) => play('slide_in.mp3', sfx, master, enabled),
  // Her line on the friends page. Shares the "Lulys Greeting" toggle with
  // slideIn rather than adding a second switch that means the same thing —
  // that toggle was already in Settings and already called this, and until now
  // nothing played through it at all.
  lulysPresenting:   (sfx, master, enabled) => play('lulys_presenting.mp3', sfx, master, enabled),
  lulysDismiss:      (sfx, master, enabled) => play('lulys_dismiss.mp3', sfx, master, enabled),
};
