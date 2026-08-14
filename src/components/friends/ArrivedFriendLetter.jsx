import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EnvelopeFace from '@/components/letter/EnvelopeFace';
import { PixelBox } from '@/components/letter/pixelBox';
import { Sounds } from '@/lib/sounds';
import { useGame } from '@/lib/gameState/useGame';

const LETTER_FONT = "'Inter Variable', system-ui, sans-serif";

/** "Ame", "Ame and Rin", "Ame, Rin and 2 others" — a batch read as a sentence. */
function namesSentence(results) {
  const names = results.map((r) => r.display_name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} other${names.length - 2 === 1 ? '' : 's'}`;
}

/**
 * The reply arriving: an envelope drops in from above the Friends page, and
 * opens into the note inside.
 *
 * Only ever carries good news — a decline leaves the sender's list silently, by
 * the design decision in 20260814120000 — so the letter never has to break bad
 * news, and the copy can be warm without hedging.
 *
 * The whole unseen batch is one letter, matching mark_friend_results_seen()'s
 * all-or-nothing stamp: there is no state where half of it has been read.
 */
export default function ArrivedFriendLetter({ results, onDismiss }) {
  const [opened, setOpened] = useState(false);
  const { state } = useGame();

  if (!results?.length) return null;

  const open = () => {
    // `?? true`: saves predating this toggle have no sfxLetterOpen key.
    Sounds.letterOpen(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxLetterOpen ?? true);
    setOpened(true);
  };

  const who = namesSentence(results);
  const many = results.length > 1;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={opened ? 'A reply to your friend request' : 'A letter has arrived — open it'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={opened ? onDismiss : undefined} />

      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {opened ? (
            <motion.div
              key="note"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            >
              <PixelBox size="8px" style={{ width: 'min(26rem, 86vw)' }}>
                <div className="px-6 py-6 space-y-4 text-center">
                  <p className="font-pixel text-sm" style={{ color: '#6b4a26' }}>
                    {many ? 'Good news!' : 'A reply!'}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ fontFamily: LETTER_FONT, color: '#5a4326' }}>
                    <span className="font-semibold">{who}</span>{' '}
                    {many ? 'accepted your friend requests.' : 'accepted your friend request.'}
                    <br />
                    <span className="opacity-75">
                      {many ? "They're all on your friends list now." : "They're on your friends list now."}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={onDismiss}
                    autoFocus
                    className="font-pixel text-[11px] transition-opacity hover:opacity-90"
                    style={{
                      background: '#7d5fde',
                      color: '#fff8e7',
                      border: '3px solid #4c3572',
                      padding: '8px 14px',
                      imageRendering: 'pixelated',
                    }}
                  >
                    Lovely ☕
                  </button>
                </div>
              </PixelBox>
            </motion.div>
          ) : (
            <motion.button
              key="envelope"
              type="button"
              onClick={open}
              autoFocus
              className="relative block focus-visible:outline-none"
              // Drops in from above the viewport — the counterpart to the sent
              // letter sailing off the top.
              initial={{ y: -420, opacity: 0, rotate: -6 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: 12, opacity: 0, transition: { duration: 0.18 } }}
              transition={{ type: 'spring', stiffness: 150, damping: 17 }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              aria-label="Open the letter"
            >
              <EnvelopeFace
                to="To: you"
                from={`From: ${who}`}
                seal="💌"
                sealColors={{ border: '#7a3b57', fill: '#d9738f' }}
                width="min(26rem, 82vw)"
              />
              <motion.p
                className="font-pixel text-xs text-white/80 text-center mt-4 drop-shadow-md"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1.8, repeat: Infinity }}
              >
                Click to open the letter
              </motion.p>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
