import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Sounds } from '@/lib/sounds';
import { useGame } from '@/lib/gameState/useGame';
import { consentStatement, licenseParagraphs, privacyStatement } from '@/lib/nsc/licenseText';
import { CONSENT_VERSION, CONSENT_CHANGE_SUMMARY, PRIVACY_LAST_UPDATED } from '@/lib/nsc/privacyNotice';
import PrivacyNoticeBody from '@/components/PrivacyNoticeBody';
import StarterPackReveal from '@/components/cafe/StarterPackReveal';
import { PixelBox } from '@/components/letter/pixelBox';
import EnvelopeFace from '@/components/letter/EnvelopeFace';

// Legal text must stay readable — Silkscreen renders lowercase as caps-like
// glyphs, so the letter body uses the same real font as form inputs.
const LETTER_FONT = "'Inter Variable', system-ui, sans-serif";

// The filled-in fields (campus, advisor, project) render in a faint purplish
// ink against the letter's brown print — like a form completed by hand, with
// each developer signing in their own color.
const LICENSE_PARAGRAPHS = licenseParagraphs({ ink: '#6b5a9c', teamInk: true });

/* The closed envelope: kraft body, darker flap triangle, wax seal. */
function ClosedEnvelope({ onOpen, autoFocus = false }) {
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      autoFocus={autoFocus}
      className="relative block focus-visible:outline-none"
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 12, opacity: 0, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      aria-label="Open the letter"
    >
      <EnvelopeFace
        to="To: our beloved cafe owner"
        from="From: Lulyssia & the development team"
      />
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

/* The pixel checkbox the consent gate is tied to — drawn in the letter's own
   ink so it reads as part of the page, not as a UI control pasted on top. */
function ConsentCheckbox({ checked }) {
  return (
    <span
      aria-hidden="true"
      // The real input is sr-only, so the ring on this box is the only thing a
      // keyboard user has to see where focus is on a gate they cannot skip.
      className="mt-0.5 flex shrink-0 items-center justify-center peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#7d5fde]"
      style={{
        width: '18px',
        height: '18px',
        background: checked ? '#7d5fde' : '#fff8e7',
        border: '3px solid #7a5230',
        imageRendering: 'pixelated',
      }}
    >
      {checked && <Check className="h-3 w-3" strokeWidth={4} style={{ color: '#fff8e7' }} />}
    </span>
  );
}

/* The unfolded letter carrying the license agreement.

   `gate` turns the letter from a re-readable keepsake into the acknowledgement
   the player must pass before entering: no X, no click-outside, and a consent
   checkbox that unlocks the only way onward. */
function OpenLetter({ onClose, gate = false, onAgree, showPrivacy, setShowPrivacy, isReconsent = false }) {
  const [agreed, setAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  // The privacy box stays locked until the notice has actually been scrolled to
  // the end. "I have read this" should cost at least the scroll.
  const [privacyRead, setPrivacyRead] = useState(false);
  const bothTicked = agreed && privacyAgreed;

  // Reaching the bottom marks it read. The `scrollHeight <= clientHeight` case
  // is not an edge case to be tidy about — on a tall window the notice fits
  // without scrolling, there is no scroll event to wait for, and without this
  // the box could never be ticked and the gate would be impassable.
  const markIfRead = (el) => {
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight + 2 || el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
      setPrivacyRead(true);
    }
  };

  if (gate && showPrivacy) {
    return (
      <motion.div
        className="relative"
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <PixelBox
          size="8px"
          border="#9a7648"
          fill="#f6ecd3"
          style={{ width: 'min(38rem, 92vw)' }}
          innerStyle={{ padding: '1.75rem 1.5rem', maxHeight: 'min(72vh, 36rem)', overflowY: 'auto' }}
          innerProps={{
            onScroll: (e) => markIfRead(e.currentTarget),
            // Runs on mount too, for the case where it all fits already.
            ref: markIfRead,
          }}
        >
          <h2 className="font-pixel text-base mb-4" style={{ color: '#4a2f14' }}>
            Privacy Notice 🔒
          </h2>
          <PrivacyNoticeBody
            font={LETTER_FONT}
            headingColor="#4a2f14"
            bodyColor="#5c4325"
            mutedColor="#8a6a42"
            ruleColor="#cbb188"
          />
          <div className="mt-5 text-right">
            <button
              type="button"
              onClick={() => setShowPrivacy(false)}
              className="font-pixel text-[11px]"
              style={{
                background: '#7d5fde', color: '#fff8e7', border: '3px solid #4c3572',
                padding: '8px 14px', imageRendering: 'pixelated',
              }}
            >
              ← Back to the letter
            </button>
          </div>
        </PixelBox>

        {/* Same hint the letter uses, for the same reason: the thing that
            unlocks the next step is below the fold, and without a prompt the
            reader just looks at a wall of text. Retires once the end is
            reached, which is also the moment the checkbox unlocks. */}
        {!privacyRead && (
          <motion.p
            className="mt-4 text-center font-pixel text-[11px] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] pointer-events-none select-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.6 }}
          >
            — scroll to the end of the notice to continue ↓ —
          </motion.p>
        )}
      </motion.div>
    );
  }

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
            {/* A returning player has passed this gate before, so without a
                reason they would think it was a bug. Say what changed, and
                when — the words they agreed to are not the words here now. */}
            {isReconsent && (
              <p
                className="mt-2 font-pixel text-[10px] leading-relaxed"
                style={{ color: '#8a4a2f' }}
              >
                Our Privacy Notice was updated on {PRIVACY_LAST_UPDATED} — it now{' '}
                {CONSENT_CHANGE_SUMMARY}. Please read it again before continuing.
              </p>
            )}
          </div>
          {!gate && (
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 hover:opacity-70 transition-opacity"
              style={{ color: '#6b4a26' }}
              aria-label="Close the letter"
            >
              <X className="w-4 h-4" />
            </button>
          )}
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

        {gate && (
          <div className="mt-5 pt-4" style={{ borderTop: '2px dashed #cbb188' }}>
            <label className="flex cursor-pointer items-start gap-2.5 select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="peer sr-only"
              />
              <ConsentCheckbox checked={agreed} />
              <span
                className="text-[12px] leading-relaxed"
                style={{ fontFamily: LETTER_FONT, color: '#5c4325' }}
              >
                I understand that {consentStatement({ voice: 'player' })}
              </span>
            </label>

            <label
              className={`mt-3 flex items-start gap-2.5 select-none ${privacyRead ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
            >
              <input
                type="checkbox"
                checked={privacyAgreed}
                disabled={!privacyRead}
                onChange={(e) => setPrivacyAgreed(e.target.checked)}
                className="peer sr-only"
              />
              <ConsentCheckbox checked={privacyAgreed} />
              <span
                className="text-[12px] leading-relaxed"
                style={{ fontFamily: LETTER_FONT, color: '#5c4325' }}
              >
                {privacyStatement({ voice: 'player' })}
              </span>
            </label>

            {/* Sits directly under the checkbox's own text, indented to line up
                with it: a disabled control needs its reason next to it, not
                below the link that follows. */}
            {!privacyRead && (
              <p className="mt-1 pl-[28px] text-[11px]" style={{ fontFamily: LETTER_FONT, color: '#8a6a42' }}>
                Read the Privacy Notice to the end first to enable this.
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="mt-2 text-[12px] underline underline-offset-2"
              style={{ fontFamily: LETTER_FONT, color: '#6b5a9c' }}
            >
              Read the Privacy Notice →
            </button>

            <div className="mt-4 text-right">
              <button
                type="button"
                onClick={onAgree}
                disabled={!bothTicked}
                className="font-pixel text-[11px] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: '#7d5fde',
                  color: '#fff8e7',
                  border: '3px solid #4c3572',
                  padding: '8px 14px',
                  imageRendering: 'pixelated',
                }}
              >
                I agree — open the cafe ☕
              </button>
            </div>
          </div>
        )}
      </PixelBox>

      {/* The consent block is below the letter's fold, and gate mode has no
          other way out — without this the player sees a wall of legal text and
          no visible way forward. Retires the moment the box is ticked. */}
      {gate && !bothTicked && (
        <motion.p
          className="mt-4 text-center font-pixel text-[11px] text-white/80 drop-shadow-[0_1px_4px_rgba(0,0,0,0.8)] pointer-events-none select-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut', delay: 0.6 }}
        >
          — scroll to the end of the letter to continue ↓ —
        </motion.p>
      )}
    </motion.div>
  );
}


// `gate`: the letter is the door into the cafe rather than a keepsake reachable
// from Help. It cannot be dismissed — only the consent checkbox opens it — and
// agreeing is what records the NSC acknowledgement on the save.
export default function LicenseEnvelope({ onClose, gate = false }) {
  const [opened, setOpened] = useState(false);
  // Lives here rather than in OpenLetter so the dialog's aria-label can follow
  // whichever of the three screens is actually showing.
  const [showPrivacy, setShowPrivacy] = useState(false);
  const { state, dispatch } = useGame();

  // 'pending' is decided BEFORE the claim dispatch lands: only the claim that
  // actually granted the pack earns the reveal — re-reads close like any modal.
  const [reveal, setReveal] = useState(false);
  const [revealPending, setRevealPending] = useState(false);

  // They agreed once, to an older version — the gate is open again only
  // because the notice changed. Worth saying so rather than looking broken.
  const isReconsent = gate && Boolean(state.settings?.nscConsentAccepted);

  const openLetter = () => {
    // `?? true`: saves created before this toggle existed have no
    // sfxLetterOpen key — default them to on, like a fresh game.
    Sounds.letterOpen(state.audio.sfxVolume, state.audio.masterVolume, state.audio.sfxLetterOpen ?? true);
    // Outside the gate, opening IS the whole ceremony, so the pack rides along
    // with it. The reducer makes the grant idempotent, so re-opens are safe to
    // dispatch unconditionally. Gate mode defers to agreeAndClose instead: a
    // player who opens the envelope and quits without agreeing would otherwise
    // bank the pack and lose its reveal forever — the next visit re-gates them,
    // but the grant is already spent, so the celebration never plays.
    if (!gate) {
      setRevealPending(!state.boosts?.starterPackClaimed);
      dispatch({ type: 'CLAIM_STARTER_PACK' });
    }
    setOpened(true);
  };

  // Closing the letter detours through the reward reveal when this open
  // was the claiming one; every other close leaves directly.
  const requestClose = () => {
    if (revealPending) {
      setRevealPending(false);
      setReveal(true);
    } else {
      onClose();
    }
  };

  // Gate mode's only exit: acknowledgement, then the reward it unlocks.
  // The grant and the decision to celebrate it happen in the same handler, so
  // this branches on a local rather than going through requestClose — a state
  // setter queued here would not be visible to a read in the same tick.
  const agreeAndClose = () => {
    // The VERSION is what the gate tests; the boolean stays for older saves.
    dispatch({
      type: 'SET_SETTINGS',
      payload: { nscConsentAccepted: true, nscConsentVersion: CONSENT_VERSION },
    });
    const granting = !state.boosts?.starterPackClaimed;
    dispatch({ type: 'CLAIM_STARTER_PACK' });
    if (granting) setReveal(true);
    else onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      // The same container carries both screens, so the label has to follow
      // whichever one is actually showing.
      aria-label={reveal
        ? 'Your starter pack from the cafe'
        : showPrivacy
          ? 'Privacy Notice'
          : 'A welcome letter from Lulyssia and the development team'}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* In gate mode the backdrop only blocks — the letter is the way through. */}
      <div
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
        onClick={gate ? undefined : requestClose}
      />
      {reveal ? (
        <StarterPackReveal audio={state.audio} onDone={onClose} />
      ) : (
        <div className="relative z-10">
          <AnimatePresence mode="wait">
            {opened
              ? <OpenLetter key="letter" onClose={requestClose} gate={gate} onAgree={agreeAndClose} showPrivacy={showPrivacy} setShowPrivacy={setShowPrivacy} isReconsent={isReconsent} />
              : <ClosedEnvelope key="envelope" onOpen={openLetter} autoFocus={gate} />}
          </AnimatePresence>

          {/* Blinking close hint — only once the letter is open. pointer-events-
              none so a click on the hint itself falls through to the backdrop
              and closes the letter, exactly as the hint promises. */}
          {opened && !gate && (
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
      )}
    </motion.div>
  );
}
