export const PET_CATALOG = {
  snow_rabbit:  { name: 'Snow Rabbit',  emoji: '🐰', price: 50,  desc: 'A fluffy companion for late-night brews.',       rarity: 'common',    category: 'rabbit' },
  tabby_cat:    { name: 'Tabby Cat',    emoji: '🐱', price: 80,  desc: 'Loves napping between customer visits.',         rarity: 'common',    category: 'cat'    },
  calico_cat:   { name: 'Calico Cat',   emoji: '🐈', price: 120, desc: 'Brings good fortune to the cafe.',               rarity: 'uncommon',  category: 'cat'    },
  midnight_cat: { name: 'Midnight Cat', emoji: '🐈‍⬛', price: 160, desc: 'Appears only in the small hours.',             rarity: 'uncommon',  category: 'cat'    },
  moon_rabbit:  { name: 'Moon Rabbit',  emoji: '🐇', price: 200, desc: 'Said to brew potions under moonlight.',          rarity: 'rare',      category: 'rabbit' },
  forest_fox:   { name: 'Forest Fox',   emoji: '🦊', price: 300, desc: 'A cunning companion from the deep woods.',       rarity: 'rare',      category: 'other'  },
  wise_owl:     { name: 'Wise Owl',     emoji: '🦉', price: 400, desc: 'Studies quietly alongside your customers.',      rarity: 'rare',      category: 'other'  },
  star_dragon:  { name: 'Star Dragon',  emoji: '🐉', price: 800, desc: 'A mythical beast born from starlight.',          rarity: 'legendary', category: 'other'  },
};

export const RARITY_CONFIG = {
  common:    { label: 'Common',    color: '#9ca3af' },
  uncommon:  { label: 'Uncommon',  color: '#4ade80' },
  rare:      { label: 'Rare',      color: '#60a5fa' },
  legendary: { label: 'Legendary', color: '#f0c674' },
};

export const PET_LIST = Object.entries(PET_CATALOG).map(([type, data]) => ({ type, ...data }));
