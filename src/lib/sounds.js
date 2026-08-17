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
    // Leave anything that is CURRENTLY PLAYING alone. The mute below is
    // synchronous, so a clip already sounding when the first gesture lands
    // would be silenced mid-word. Reachable whenever the first sound is not
    // started by a mouse: Enter on Start Session, or the phone warning firing
    // off a timer, with the player's first click arriving during it.
    //
    // Tested against `paused`, NOT against `claimed`: claimed is permanent and
    // set before every play() including ones that fail, so keying on it
    // excluded an element from priming for the rest of the page load after a
    // single early rejected play. On engines that unlock per element rather
    // than per document, that is a clip which never sounds again — a worse
    // failure than the one this guard exists to prevent, and it took the
    // opposite form: the first version silenced a sound, this one would have
    // silenced a file.
    if (!a.paused) return;
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
  // Both gestures, matching cafeAudioEngine's own unlock. pointerdown alone
  // meant a keyboard-only player never primed anything — and the guard above
  // reasons explicitly about Enter on Start Session, which is precisely the
  // path that could not get here. A later timer-fired sound (the phone
  // warning) would then be rejected by autoplay policy and simply not happen.
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
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
  // Her two lines on the friends page. They share the "Lulys Voice" toggle
  // (sfxSlideIn) with slideIn rather than adding switches that mean the same
  // thing — that toggle already existed in Settings and drove nothing at all
  // until these landed.
  lulysPresenting:   (sfx, master, enabled) => play('lulys_presenting.mp3', sfx, master, enabled),
  lulysDismiss:      (sfx, master, enabled) => play('lulys_dismiss.mp3', sfx, master, enabled),
};
