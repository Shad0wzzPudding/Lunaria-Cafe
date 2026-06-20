import { useState, useEffect } from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { PET_LIST, RARITY_CONFIG } from '@/lib/cafe/petCatalog.js';
import { Coins, PawPrint, Cat, Rabbit, Heart, X } from 'lucide-react';

const PET_SHOP_ART = '/assets/pet-shop.png';

const TABS = [
  { id: 'all',    Icon: PawPrint, label: 'All Pets'  },
  { id: 'cat',    Icon: Cat,      label: 'Cats'       },
  { id: 'rabbit', Icon: Rabbit,   label: 'Rabbits'    },
  { id: 'owned',  Icon: Heart,    label: 'My Pets'    },
];

export default function PetShopPanel({ onClose }) {
  const { state, dispatch } = useGame();
  const [activeTab, setActiveTab] = useState('all');
  const [selectedPet, setSelectedPet] = useState(PET_LIST[0]);

  const ownedTypes = new Set((state.pets?.owned ?? []).map((p) => p.type));

  const filteredPets = PET_LIST.filter((pet) => {
    if (activeTab === 'owned')  return ownedTypes.has(pet.type);
    if (activeTab === 'cat')    return pet.category === 'cat';
    if (activeTab === 'rabbit') return pet.category === 'rabbit';
    return true;
  });

  useEffect(() => {
    const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleBuy = () => {
    if (!selectedPet) return;
    dispatch({ type: 'BUY_PET', payload: { petType: selectedPet.type } });
  };

  const isOwned   = selectedPet ? ownedTypes.has(selectedPet.type) : false;
  const canAfford = selectedPet ? state.coins >= selectedPet.price : false;
  const rarity    = selectedPet ? RARITY_CONFIG[selectedPet.rarity] : null;

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
        {/* Background art — pointer-events disabled so it never blocks inputs */}
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

          {/* Close button — top-right corner of the frame */}
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
            style={{ left: '10%', top: '19.5%', width: '45.5%', height: '5.5%' }}
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

          {/* Pet grid — 4 columns × 2 rows */}
          <div
            className="absolute grid grid-cols-4 content-start gap-1.5 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            style={{ left: '10%', top: '26%', width: '45.5%', height: '65%' }}
          >
            {filteredPets.length === 0 ? (
              <div className="col-span-4 flex items-center justify-center pt-8 font-body text-xs text-[#8f6a40]/50">
                {activeTab === 'owned' ? 'No pets owned yet.' : 'None found.'}
              </div>
            ) : (
              filteredPets.map((pet) => {
                const owned    = ownedTypes.has(pet.type);
                const selected = selectedPet?.type === pet.type;
                const rar      = RARITY_CONFIG[pet.rarity];
                return (
                  <button
                    key={pet.type}
                    type="button"
                    onClick={() => setSelectedPet(pet)}
                    className={`relative flex flex-col items-center gap-0.5 rounded-lg border-2 p-1.5 transition-all ${
                      selected
                        ? 'border-[#8f5a30] bg-[#8f5a30]/20 shadow-sm'
                        : 'border-[#c4956a]/30 bg-[#f5e4c8]/30 hover:border-[#8f5a30]/50 hover:bg-[#8f5a30]/10'
                    }`}
                  >
                    <span className="text-2xl leading-none">{pet.emoji}</span>
                    <span className="line-clamp-1 text-center font-pixel text-[8px] leading-tight text-[#5c3620]">
                      {pet.name}
                    </span>
                    <span
                      className="flex items-center gap-0.5 font-pixel text-[8px]"
                      style={{ color: rar.color }}
                    >
                      <Coins className="h-2.5 w-2.5 text-yellow-500" strokeWidth={2.5} />
                      {pet.price}
                    </span>
                    {owned && (
                      <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-[8px] font-bold text-white">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* ── RIGHT PANEL ────────────────────────────────── */}

          {/* Pet name — scroll banner area */}
          <div
            className="absolute flex items-center justify-center"
            style={{ left: '59%', top: '15%', width: '32%', height: '8%' }}
          >
            <span className="truncate px-2 font-pixel text-[13px] text-[#5c3620]">
              {selectedPet?.name ?? '—'}
            </span>
          </div>

          {/* Pet detail box */}
          <div
            className="absolute flex flex-col items-center justify-center gap-2 p-3"
            style={{ left: '59%', top: '24%', width: '32%', height: '48%' }}
          >
            {selectedPet ? (
              <>
                <span className="text-5xl leading-none">{selectedPet.emoji}</span>
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
              </>
            ) : (
              <span className="font-body text-xs text-[#8f6a40]/50">Select a pet</span>
            )}
          </div>

          {/* Buy / Owned button area — purple button at panel bottom */}
          <div
            className="absolute flex flex-col items-center justify-center gap-1"
            style={{ left: '62%', top: '74%', width: '27%', height: '17%' }}
          >
            {selectedPet && (
              isOwned ? (
                <div className="flex items-center gap-1.5 rounded-lg bg-green-700/40 px-4 py-2 font-pixel text-[11px] text-green-300">
                  <span>✓</span> Owned
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleBuy}
                  disabled={!canAfford}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-2 font-pixel text-[11px] transition-colors ${
                    canAfford
                      ? 'bg-[#6b4c8a] text-[#f0d8ff] shadow-md hover:bg-[#7d5ca0]'
                      : 'cursor-not-allowed bg-[#6b4c8a]/30 text-[#9b88aa]'
                  }`}
                >
                  <Coins className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {canAfford ? `Buy  ${selectedPet.price}` : 'Need more coins'}
                </button>
              )
            )}
            {/* Current coins indicator */}
            <div className="flex items-center gap-1">
              <Coins className="h-3 w-3 text-yellow-400" strokeWidth={2.5} />
              <span className="font-pixel text-[9px] text-[#7a5535]">{state.coins} coins</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
