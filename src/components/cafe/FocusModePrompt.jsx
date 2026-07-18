import { motion } from 'framer-motion';
import { Gamepad2, Sparkles } from 'lucide-react';
import { getFocusPanelStyle } from '@/lib/theme/themeDeriver';
import { useGame } from '@/lib/gameState/useGame';
import { BOOST_LABEL, BOOST_WINDOW_LABEL } from '@/lib/gameState/constants';

const MODES = [
  {
    id: 'game',
    icon: Gamepad2,
    label: 'Game Mode',
    desc: 'Run your cafe while you focus. Customers arrive, coins flow, and your pets roam — the full experience.',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.3)',
  },
  {
    id: 'zen',
    icon: Sparkles,
    label: 'Zen Mode',
    desc: 'A calm, distraction-free view. The cafe keeps running silently in the background while you focus.',
    color: '#6ee7b7',
    bg: 'rgba(110,231,183,0.08)',
    border: 'rgba(110,231,183,0.3)',
  },
];

export default function FocusModePrompt({ onSelect }) {
  const { state } = useGame();
  const tickets = state.boosts?.focusTickets ?? 0;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        className="relative z-10 w-full max-w-lg mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-8"
        style={getFocusPanelStyle()}
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 16 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        <div className="text-center mb-6">
          <h2 className="font-display text-xl text-foreground mb-1">How would you like to focus?</h2>
          <p className="font-body text-sm text-muted-foreground">Your choice will be remembered. You can switch anytime during a session.</p>
        </div>

        {/* Spending happens at session start with no refund — the player
            should know a ticket is about to go before picking a mode. */}
        {tickets > 0 && (
          <div
            className="mb-5 flex items-center gap-3 rounded-lg px-3 py-2.5"
            style={{ background: 'rgba(110,231,183,0.08)', boxShadow: '0 0 0 1px rgba(110,231,183,0.3)' }}
          >
            <img src="/assets/Potion_green.png" alt="" className="h-9 w-auto select-none" draggable={false} />
            <p className="font-body text-xs text-muted-foreground leading-snug">
              <span className="font-pixel text-[11px]" style={{ color: '#6ee7b7' }}>Focus boost ready!</span>
              <br />
              A ticket is spent when the session starts — {BOOST_LABEL} for the {BOOST_WINDOW_LABEL}. {tickets} left.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className="group flex flex-col items-center gap-3 rounded-xl border p-5 text-center transition-all duration-200 hover:scale-[1.02] hover:shadow-lg"
              style={{ background: mode.bg, borderColor: mode.border }}
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full"
                style={{ background: `${mode.color}18`, boxShadow: `0 0 0 1px ${mode.color}40` }}
              >
                <mode.icon size={22} style={{ color: mode.color }} strokeWidth={1.8} />
              </div>
              <div>
                <div className="font-pixel text-sm mb-1" style={{ color: mode.color }}>{mode.label}</div>
                <div className="font-body text-[11px] text-muted-foreground leading-snug">{mode.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
