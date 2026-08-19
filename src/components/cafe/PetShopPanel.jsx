import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '@/lib/gameState/useGame';
import { PET_LIST, RARITY_CONFIG, petTypeForNpc } from '@/lib/cafe/petCatalog.js';
import { Coins, PawPrint, Cat, Rabbit, Heart, X } from 'lucide-react';

const PET_SHOP_ART = '/assets/UI/pet-shop.png';

const TABS = [
  { id: 'all',    Icon: PawPrint, label: 'All Pets' },
  { id: 'cat',    Icon: Cat,      label: 'Cats'      },
  { id: 'rabbit', Icon: Rabbit,   label: 'Rabbits'   },
  { id: 'owned',  Icon: Heart,    label: 'My Pets'   },
];

export default function PetShopPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedPet, setSelectedPet] = useState(PET_LIST[0]);
  const [notification, setNotification] = useState(null);

  // Two tallies, because a pet can be owned without being out. inCafe comes
  // from the NPCs actually wandering the room; stored comes from the ones put
  // away. Owning is the sum — read either alone and a napping pet either
  // disappears from the shop or looks like it is still on the floor.
  const inCafeCounts = {};
  for (const npc of state.npcs.rabbits) {
    const type = petTypeForNpc('rabbit', npc.mood);
    if (type) inCafeCounts[type] = (inCafeCounts[type] ?? 0) + 1;
  }
  for (const npc of state.npcs.cats) {
    const type = petTypeForNpc('cat', npc.mood);
    if (type) inCafeCounts[type] = (inCafeCounts[type] ?? 0) + 1;
  }

  const storedCounts = {};
  for (const p of state.pets?.stored ?? []) {
    storedCounts[p.type] = (storedCounts[p.type] ?? 0) + 1;
  }

  const ownedCounts = {};
  for (const type of new Set([...Object.keys(inCafeCounts), ...Object.keys(storedCounts)])) {
    ownedCounts[type] = (inCafeCounts[type] ?? 0) + (storedCounts[type] ?? 0);
  }

  const filteredPets = PET_LIST.filter((pet) => {
    if (activeTab === 'owned')  return (ownedCounts[pet.type] ?? 0) > 0;
    if (activeTab === 'cat')    return pet.category === 'cat'    || pet.npcType === 'cat';
    if (activeTab === 'rabbit') return pet.category === 'rabbit' || pet.npcType === 'rabbit';
    return true;
  });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const showNotif = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 2500);
  };

  const putAway = () => {
    if (!selectedPet || inCafeCount === 0) return;
    dispatch({ type: 'STORE_PET', payload: { petType: selectedPet.type } });
  };

  const bringOut = () => {
    if (!selectedPet || storedCount === 0) return;
    dispatch({ type: 'DEPLOY_PET', payload: { petType: selectedPet.type } });
  };

  const handleBuy = () => {
    if (!selectedPet) return;
    if (!canAfford) { showNotif("Not enough coins!"); return; }
    dispatch({ type: 'BUY_PET', payload: { petType: selectedPet.type } });
  };

  const canAfford  = selectedPet ? state.coins >= selectedPet.price : false;
  const ownedCount   = selectedPet ? (ownedCounts[selectedPet.type] ?? 0) : 0;
  const inCafeCount  = selectedPet ? (inCafeCounts[selectedPet.type] ?? 0) : 0;
  const storedCount  = selectedPet ? (storedCounts[selectedPet.type] ?? 0) : 0;
  const rarity     = selectedPet ? RARITY_CONFIG[selectedPet.rarity] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative drop-shadow-[0_26px_34px_rgba(0,0,0,0.55)]"
        role="dialog"
        aria-modal="true"
        aria-label="Pet Shop"
      >
        {/* Background art */}
        <img
          src={PET_SHOP_ART}
          className="block h-auto w-auto max-h-[88vh] max-w-[95vw]"
          style={{ imageRendering: 'pixelated', minWidth: '520px' }}
          alt=""
          aria-hidden="true"
          draggable={false}
        />

        {/* Interactive overlay */}
        <div className="absolute inset-0 z-10">

          {/* Close button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-[#5c3620]/60 text-[#f5d9b0] transition-colors hover:bg-[#5c3620]"
            style={{ right: '4.8%', top: '5.5%' }}
            title="Close pet shop"
          >
            <X className="h-3 w-3" />
          </button>

          {/* ── LEFT PANEL ─────────────────────────────────── */}

          {/* Tab row */}
          <div
            className="absolute flex items-center"
            style={{ left: '11%', top: '18.5%', width: '45.5%', height: '5.5%' }}
          >
            {TABS.map(({ id, Icon, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                title={label}
                className={`flex flex-1 items-center justify-center rounded py-0.5 transition-colors ${
                  activeTab === id
                    ? 'bg-[#8f5a30]/35 text-[#5c3620]'
                    : 'text-[#8f6a40]/60 hover:bg-[#8f5a30]/15 hover:text-[#5c3620]'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={1.8} />
              </button>
            ))}
          </div>

          {/* Pet grid — 4 cols × 2 rows to match the art's card slots */}
          <div
            className="absolute grid grid-cols-4 gap-1.5"
            style={{ left: '13%', top: '26%', width: '41.2%', height: '42%', gridTemplateRows: 'repeat(2, 1fr)' }}
          >
            {filteredPets.length === 0 ? (
              <div className="col-span-4 row-span-2 flex items-center justify-center font-body text-xs text-[#8f6a40]/50">
                {activeTab === 'owned' ? 'No pets adopted yet.' : 'None found.'}
              </div>
            ) : (
              filteredPets.map((pet) => {
                const count    = ownedCounts[pet.type] ?? 0;
                const selected = selectedPet?.type === pet.type;
                const rar      = RARITY_CONFIG[pet.rarity];
                return (
                  <button
                    key={pet.type}
                    type="button"
                    onClick={() => setSelectedPet(pet)}
                    className={`relative h-full flex flex-col items-center justify-center gap-0.5 rounded-lg border-2 p-1 transition-all ${
                      selected
                        ? 'border-[#8f5a30] bg-[#8f5a30]/20 shadow-sm'
                        : 'border-[#c4956a]/30 bg-[#f5e4c8]/30 hover:border-[#8f5a30]/50 hover:bg-[#8f5a30]/10'
                    }`}
                  >
                    <span className="text-2xl leading-none">{pet.emoji}</span>
                    <span className="line-clamp-1 text-center font-pixel text-[8px] leading-tight text-[#5c3620]">
                      {pet.name}
                    </span>
                    {activeTab === 'owned' ? (
                      <span className="font-pixel text-[8px]" style={{ color: rar.color }}>
                        {/* "2/3" reads as out-of-owned. A single number here
                            would hide the fact that some are napping. */}
                        {(inCafeCounts[pet.type] ?? 0)}/{count}
                      </span>
                    ) : (
                      <>
                        <span
                          className="flex items-center gap-0.5 font-pixel text-[8px]"
                          style={{ color: rar.color }}
                        >
                          <Coins className="h-2.5 w-2.5 text-yellow-500" strokeWidth={2.5} />
                          {pet.price}
                        </span>
                        {count > 0 && (
                          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-[#8f5a30] font-pixel text-[8px] text-[#fff0d7]">
                            {count}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────── */}

          {/* Pet name — scroll banner, moved up 3% */}
          <div
            className="absolute flex items-center justify-center"
            style={{ left: '59%', top: '17%', width: '32%', height: '8%' }}
          >
            <span className="truncate px-2 font-pixel text-[13px] text-[#5c3620]">
              {selectedPet?.name ?? '—'}
            </span>
          </div>

          {/* Emoji */}
          <div
            className="absolute flex items-center justify-center"
            style={{ left: '59%', top: '33%', width: '32%', height: '12%' }}
          >
            {selectedPet && <span className="text-5xl leading-none">{selectedPet.emoji}</span>}
          </div>

          {/* Rarity + desc + price + in cafe */}
          <div
            className="absolute flex flex-col items-center justify-start gap-2 p-2"
            style={{ left: '59%', top: '53%', width: '32%', height: '44%' }}
          >
            {selectedPet ? (
              <>
                <span
                  className="rounded px-1.5 py-0.5 font-pixel text-[9px]"
                  style={{ color: rarity?.color, background: `${rarity?.color}22` }}
                >
                  {rarity?.label}
                </span>
                <p className="px-1 text-center font-body text-[11px] leading-snug text-[#5c3620]">
                  {selectedPet.desc}
                </p>
                <div className="mt-1 flex items-center gap-1">
                  <Coins className="h-3.5 w-3.5 text-yellow-500" strokeWidth={2.5} />
                  <span className="font-pixel text-[13px] text-[#5c3620]">{selectedPet.price}</span>
                </div>
                {ownedCount > 0 && (
                  <>
                    {/* Both figures, because they answer different questions:
                        how many you own, and how many are actually out. They
                        were the same number until pets could be put away. */}
                    <span className="font-body text-[10px] text-[#8f6a40]">
                      In cafe: {inCafeCount}
                      {storedCount > 0 && ` · napping: ${storedCount}`}
                    </span>

                    {/* Put away / bring out. Shown only for a pet you own, and
                        each side disabled when there is none of that kind on
                        that side — with a count of 0 the action has nothing to
                        act on, and a button that silently does nothing is
                        worse than one that looks unavailable. */}
                    <div className="mt-0.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={putAway}
                        disabled={inCafeCount === 0}
                        className="rounded border border-[#c4956a]/60 bg-[#f5e4c8]/60 px-2 py-0.5 font-pixel text-[8px] text-[#5c3620] transition-colors hover:bg-[#e8cf9e] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Put away
                      </button>
                      <button
                        type="button"
                        onClick={bringOut}
                        disabled={storedCount === 0}
                        className="rounded border border-[#c4956a]/60 bg-[#f5e4c8]/60 px-2 py-0.5 font-pixel text-[8px] text-[#5c3620] transition-colors hover:bg-[#e8cf9e] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Bring out
                      </button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <span className="font-body text-xs text-[#8f6a40]/50">Select a pet</span>
            )}
          </div>

          {/* Buy button */}
          <div
            className="absolute flex items-center justify-center"
            style={{ left: '75.9%', top: '81%', width: '14.6%', height: '10%' }}
          >
            {selectedPet && (
              <>
                <AnimatePresence>
                  {notification && (
                    <motion.div
                      key="toast"
                      className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#5c3620]/80 px-3 py-1 font-pixel text-[9px] text-[#f5d9b0] shadow-md"
                      initial={{ opacity: 0, y: 8, scale: 0.9 }}
                      animate={{ opacity: 1, y: [8, -6, 2, -3, 0], scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.9 }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                    >
                      {notification}
                    </motion.div>
                  )}
                </AnimatePresence>
                <div
                  className="w-full"
                  onClick={!canAfford ? () => showNotif('Not enough coins!') : undefined}
                >
                  <button
                    type="button"
                    onClick={handleBuy}
                    disabled={!canAfford}
                    className={`w-full flex items-center justify-center rounded-lg px-4 py-2 font-pixel text-[11px] transition-colors ${
                      canAfford
                        ? 'text-[#f0d8ff] shadow-md'
                        : 'pointer-events-none text-[#9b88aa]/60'
                    }`}
                  >
                    {canAfford ? `Adopt ${selectedPet.price}` : 'Need more coins'}
                  </button>
                </div>
              </>
            )}
          </div>

          {/* The balance, sitting in the slot the panel art draws for it: a
              paw medallion and a recessed strip beside the Adopt button.
              The number alone — the medallion already says what the number
              counts, so spelling out "coins" beside it said it twice and
              crowded a strip only wide enough for the figure. */}
          <div
            className="absolute flex items-center justify-center gap-1"
            style={{ left: '55.5%', top: '84%', width: '27%', height: '5%' }}
          >
            <span className="font-pixel text-[14px] text-[#7a5535]">{state.coins}</span>
          </div>

        </div>
      </div>
    </div>
  );
}
