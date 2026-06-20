export const PET_CATALOG = {
  happy_rabbit:  { name: 'Happy Rabbit',  emoji: '🐰', price: 50,  desc: 'A cheerful bunny that bounces around the cafe.',    rarity: 'common',   npcType: 'rabbit', mood: 'happy'   },
  sleepy_rabbit: { name: 'Sleepy Rabbit', emoji: '🐇', price: 80,  desc: 'Dozes off in the coziest corners of the cafe.',     rarity: 'uncommon', npcType: 'rabbit', mood: 'sleepy'  },
  curious_cat:   { name: 'Curious Cat',   emoji: '🐱', price: 100, desc: 'Always watching, always wondering what comes next.', rarity: 'common',   npcType: 'cat',    mood: 'curious' },
  lazy_cat:      { name: 'Lazy Cat',      emoji: '🐈', price: 120, desc: 'Finds the warmest spot and refuses to leave it.',    rarity: 'uncommon', npcType: 'cat',    mood: 'lazy'    },
};

export const RARITY_CONFIG = {
  common:   { label: 'Common',   color: '#9ca3af' },
  uncommon: { label: 'Uncommon', color: '#4ade80' },
};

export const PET_LIST = Object.entries(PET_CATALOG).map(([type, data]) => ({ type, ...data }));
