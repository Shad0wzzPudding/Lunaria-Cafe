const cache = {};

function play(filename) {
  if (!cache[filename]) {
    cache[filename] = new Audio(`/assets/sounds/${filename}`);
  }
  const audio = cache[filename];
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

export const Sounds = {
  sessionStart:      () => play('session_start.mp3'),
  sessionFinishDone: () => play('session_finish(done).mp3'),
  sessionFinishFail: () => play('session_finish(fail).mp3'),
  petShopOpen:       () => play('petShop_open.mp3'),
  petShopClose:      () => play('petShop_close.mp3'),
};
