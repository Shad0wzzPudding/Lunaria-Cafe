import { Fragment, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { Sounds } from '@/lib/sounds';
import { useGame } from '@/lib/gameState/useGame';

// Legal text must stay readable — Silkscreen renders lowercase as caps-like
// glyphs, so the letter body uses the same real font as form inputs.
const LETTER_FONT = "'Inter Variable', system-ui, sans-serif";

// Single-notch stepped corners — the pixel-art silhouette. Border is faked by
// nesting two clipped layers (clip-path cuts real CSS borders off).
const PIXEL_CORNERS = (s) =>
  `polygon(0 ${s}, ${s} ${s}, ${s} 0, calc(100% - ${s}) 0, calc(100% - ${s}) ${s}, 100% ${s}, 100% calc(100% - ${s}), calc(100% - ${s}) calc(100% - ${s}), calc(100% - ${s}) 100%, ${s} 100%, ${s} calc(100% - ${s}), 0 calc(100% - ${s}))`;

const ADVISOR_NAME = '"Dr. Punyanuch Borwarnginn"';
const PROJECT_NAME = '"Lunaria Cafe"';

// The three developers, each signing in their own ink — muted "pen on cream
// paper" shades, not UI-bright colors, so they sit inside the letter's world.
const TEAM_MEMBERS = [
  { name: 'Thanita Thitakan',        color: '#4a8b57' }, // greenish
  { name: 'Sawastachod Siriphatum',  color: '#1f7f8c' }, // cyan
  { name: 'Pisitpong Srisuthangkul', color: '#c1701f' }, // orangish
];

const TeamNames = () => (
  <>
    {TEAM_MEMBERS.map((m, i) => (
      <Fragment key={m.name}>
        {/* separators stay in the letter's print color, outside the ink spans */}
        {i > 0 && (i === TEAM_MEMBERS.length - 1 ? ', and ' : ', ')}
        <span style={{ color: m.color }}>{m.name}</span>
      </Fragment>
    ))}
  </>
);

// The remaining filled-in fields (campus, advisor, project) render in a faint
// purplish ink against the letter's brown print — like a form completed by hand.
const INK_COLOR = '#6b5a9c';
const Ink = ({ children }) => <span style={{ color: INK_COLOR }}>{children}</span>;

const LICENSE_PARAGRAPHS = [
  <>This software is a work developed by <TeamNames /> from <Ink>Mahidol University Salaya Campus</Ink> under the provision of <Ink>{ADVISOR_NAME}</Ink> under <Ink>{PROJECT_NAME}</Ink>, which has been supported by the National Science and Technology Development Agency (NSTDA), in order to encourage pupils and students to learn and practice their skills in developing software.</>,
  <>Therefore, the intellectual property of this software shall belong to the developer and the developer gives NSTDA a permission to distribute this software as an &quot;as is&quot; and non-modified software for a temporary and non-exclusive use without remuneration to anyone for his or her own purpose or academic purpose, which are not commercial purposes.</>,
  <>In this connection, NSTDA shall not be responsible to the user for taking care, maintaining, training, or developing the efficiency of this software. Moreover, NSTDA shall not be liable for any error, software efficiency and damages in connection with or arising out of the use of the software.</>,
];

function PixelBox({ size = '6px', border = '#7a5230', fill = '#e8cf9e', className = '', style = {}, innerStyle = {}, children }) {
  return (
    <div className={className} style={{ clipPath: PIXEL_CORNERS(size), background: border, padding: '4px', ...style }}>
      <div style={{ clipPath: PIXEL_CORNERS(size), background: fill, width: '100%', height: '100%', ...innerStyle }}>
        {children}
      </div>
    </div>
  );
}

/* The closed envelope: kraft body, darker flap triangle, wax seal. */
function ClosedEnvelope({ onOpen }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      className="relative block focus-visible:outline-none"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 12, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      aria-label="Open the letter"
    >
      <PixelBox size="8px" style={{ width: 'min(30rem, 86vw)', aspectRatio: '30 / 19' }} innerStyle={{ position: 'relative', overflow: 'hidden' }}>
        {/* Bottom V fold lines of the envelope front */}
        <div className="absolute inset-0" aria-hidden="true">
          <div className="absolute left-0 bottom-0 w-1/2 h-full" style={{ background: '#dfc28c', clipPath: 'polygon(0 100%, 100% 100%, 0 18%)' }} />
          <div className="absolute right-0 bottom-0 w-1/2 h-full" style={{ background: '#dfc28c', clipPath: 'polygon(100% 100%, 0 100%, 100% 18%)' }} />
          {/* Top flap */}
          <div className="absolute left-0 top-0 w-full h-[58%]" style={{ background: '#caa365', clipPath: 'polygon(0 0, 100% 0, 50% 100%)' }} />
          <div className="absolute left-0 top-0 w-full h-[58%]" style={{ background: '#b28950', clipPath: 'polygon(0 0, 100% 0, 50% 100%, 50% calc(100% - 6px), calc(100% - 8px) 4px, 8px 4px, 50% calc(100% - 6px), 50% 100%)' }} />
        </div>
        {/* Wax seal */}
        <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2" aria-hidden="true">
          <PixelBox size="6px" border="#4c3572" fill="#7d5fde" style={{ width: '3.4rem', height: '3.4rem' }} innerStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="text-xl select-none">🌙</span>
          </PixelBox>
        </div>
        {/* Address lines */}
        <div className="absolute left-0 right-0 bottom-[8%] text-center space-y-0.5">
          <p className="font-pixel text-[11px]" style={{ color: '#6b4a26' }}>To: our beloved cafe owner</p>
          <p className="font-pixel text-[10px]" style={{ color: '#8a6a42' }}>From: Lulyssia & the development team</p>
        </div>
      </PixelBox>
      <motion.p
        className="font-pixel text-xs text-white/80 text-center mt-4 drop-shadow-md"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        Click to open the letter
      </motion.p>
    </motion.button>
  );
}

/* The unfolded letter carrying the license agreement. */
function OpenLetter({ onClose }) {
  return (
    <motion.div
      className="relative"
      initial={{ y: 120, scale: 0.6, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ y: 40, scale: 0.9, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 200, damping: 24 }}
    >
      <PixelBox
        size="8px"
        border="#9a7648"
        fill="#f6ecd3"
        style={{ width: 'min(36rem, 92vw)' }}
        innerStyle={{ padding: '1.75rem 1.5rem', maxHeight: 'min(70vh, 34rem)', overflowY: 'auto' }}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="font-pixel text-base" style={{ color: '#4a2f14' }}>License Agreement 💌</h2>
            <p className="font-pixel text-[10px] mt-1" style={{ color: '#8a6a42' }}>
              A letter from Lulyssia & the development team
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 hover:opacity-70 transition-opacity"
            style={{ color: '#6b4a26' }}
            aria-label="Close the letter"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3" style={{ fontFamily: LETTER_FONT }}>
          <p className="text-sm leading-relaxed" style={{ color: '#54390f' }}>
            Dear cafe owner — before you settle in, a small formality from the world outside ours:
          </p>
          {LICENSE_PARAGRAPHS.map((para, i) => (
            <p key={i} className="text-[13px] leading-relaxed" style={{ color: '#5c4325' }}>
              {para}
            </p>
          ))}
          <p className="text-sm leading-relaxed pt-1" style={{ color: '#54390f' }}>
            Thank you for reading. The kettle is already on. ☕
          </p>
        </div>

        <div className="mt-5 pt-3 text-right" style={{ borderTop: '2px dashed #cbb188' }}>
          <p className="font-pixel text-[11px]" style={{ color: '#6b4a26' }}>— Lulyssia 🌙</p>
          <p className="font-pixel text-[10px] mt-0.5" style={{ color: '#8a6a42' }}>& the development team</p>
        </div>
      </PixelBox>
    </motion.div>
  );
}

export default function LicenseEnvelope({ onClose }) {
  const [opened, setOpened] = useState(false);
  const { state, dispatch } = useGame();

  const openLetter = () => {
    // `?? true`: saves created before this toggle existed have no
    // sfxLetterOpen key — default them to on, like a fresh game.
    Sounds.letterOpen(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxLetterOpen ?? true);
    // Retires the main menu's "you've got mail" bubble, permanently (persisted
    // with the save). Deliberately on OPENING the envelope, not on visiting
    // the Help page — the bubble's promise is the letter itself.
    dispatch({ type: 'SET_SETTINGS', payload: { welcomeLetterOpened: true } });
    // Starter pack rides on the same moment: the reducer makes the grant
    // idempotent, so re-opens (and pre-feature saves re-reading the letter)
    // are safe to dispatch unconditionally.
    dispatch({ type: 'CLAIM_STARTER_PACK' });
    setOpened(true);
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10">
        <AnimatePresence mode="wait">
          {opened
            ? <OpenLetter key="letter" onClose={onClose} />
            : <ClosedEnvelope key="envelope" onOpen={openLetter} />}
        </AnimatePresence>

        {/* Blinking close hint — only once the letter is open. pointer-events-
            none so a click on the hint itself falls through to the backdrop
            and closes the letter, exactly as the hint promises. */}
        {opened && (
          <motion.p
            className="mt-4 text-center font-pixel text-[11px] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] pointer-events-none select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.6 }}
          >
            — press anywhere outside the letter to close it —
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}
