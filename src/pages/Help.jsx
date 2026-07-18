import { useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PANEL_BRIGHT_BG } from '@/lib/theme/themeDeriver';
import LicenseEnvelope from '@/components/LicenseEnvelope';

const TABS = [
  { id: 'info', label: 'Info' },
  { id: 'credits', label: 'Credits' },
  { id: 'tutorial', label: 'Tutorial' },
];

/* ------------------------------- Tutorial ------------------------------- */

// One entry per gameplay system. Numbers here mirror the actual tuning in
// browserAI.js / gameReducer.js — update them if the economy is retuned.
const TUTORIAL_SECTIONS = [
  {
    emoji: '☕',
    title: 'The Core Loop',
    body: [
      'Lunaria Cafe is a focus companion: you concentrate on your real work, and a tiny magical cafe flourishes beside you.',
      'Open the cafe, start a focus session, and put your phone down. While you stay focused, customers arrive, coins flow in, and your pets roam. Lose focus, and chaos creeps in.',
    ],
  },
  {
    emoji: '⏱️',
    title: 'Focus Sessions',
    body: [
      'Press Start Focus in the cafe to begin a 25-minute session. You can choose between two views:',
    ],
    list: [
      ['Game Mode', 'watch your cafe live — customers, pets, and all.'],
      ['Zen Mode', 'a calm, distraction-free scene; the cafe keeps running silently behind it.'],
    ],
    footer:
      'You can switch views or pause anytime. Pausing freezes everything — the timer, your score, and the cafe.',
  },
  {
    emoji: '📷',
    title: 'The Attention Camera',
    body: [
      'During a session your camera watches for distractions: picking up your phone, looking away for a while, or leaving your seat.',
      'Your focus score runs from 0 to 100 and starts at 70. Staying focused slowly raises it — reaching 100 takes about five minutes of unbroken focus. Distractions pull it down.',
    ],
    footer:
      'Privacy: everything runs locally in your browser. No video or images ever leave your device.',
  },
  {
    emoji: '🌫️',
    title: 'Chaos',
    body: [
      'As your focus score falls, the cafe descends through four stages of chaos:',
    ],
    list: [
      ['Calm (70+)', 'everything is peaceful; customers pay full price.'],
      ['Cute Chaos 👻 (50–69)', 'ghosts appear; customers pay half.'],
      ['Magical Chaos 🔥 (30–49)', 'fire sprites cause trouble; a quarter of the coins, and many customers give up and leave.'],
      ['Midnight Incident 🌫️ (below 30)', 'the mist takes over — no coins, and most customers walk out.'],
    ],
    footer: 'Refocus and the cafe calms back down on its own.',
  },
  {
    emoji: '🚨',
    title: 'Danger!',
    body: [
      'Picking up your phone — or letting your score hit 0 — starts a 30-second danger countdown. Put the phone down (or recover your focus) before it runs out, or the session fails.',
      'A failed session costs 3 reputation and does not count toward your streak.',
    ],
  },
  {
    emoji: '🪙',
    title: 'Coins & Customers',
    body: [
      'Customers wander in while you focus and seat themselves at chairs and sofas. They are served automatically — your only job is to keep the cafe calm so they stay and pay.',
      'Spend coins in Decorate mode on furniture (more seats = more customers at once) and in the Pet Shop on companions who roam your cafe.',
    ],
  },
  {
    emoji: '⭐',
    title: 'Reputation & Streak',
    body: [
      'Serving a customer while your focus score is 85 or higher earns +1 reputation. Serving during heavy chaos risks losing it, and failed sessions cost 3.',
      'Your streak counts consecutive days with at least one completed session — the timer must actually reach the end. Skip two days and the streak is lost.',
    ],
  },
  {
    emoji: '🎓',
    title: 'Classrooms & Live Sessions',
    body: [
      'Signed-in students can join classrooms and compete on per-class leaderboards: Overall, Reputation, Focus, Opening Time, and Coins.',
      'Instructors can start live sessions — you\'ll get an invitation wherever you are in the app. Joining pulls you into the cafe and starts a synchronized focus session with your whole class on a live board.',
    ],
  },
  {
    emoji: '🎵',
    title: 'Sound & Ambience',
    body: [
      'The speaker button in the cafe footer opens the sound panel: background music (3 tracks or shuffle), rain, crackling fire, and cafe chatter. Volume sliders and per-effect toggles live in Settings.',
    ],
  },
];

/* --------------------------------- Info --------------------------------- */

const INFO_SECTIONS = [
  {
    emoji: '🌙',
    title: 'About Lunaria Cafe',
    body: [
      'Lunaria Cafe is a pixel-art focus companion — a tiny magical world that thrives while you concentrate on your real work.',
      'Instead of a bare timer, your focus sessions run a cozy cafe: staying on task keeps it calm and prosperous, while distractions invite chaos. An on-device AI watches for your phone and wandering eyes, so the cafe honestly reflects how focused you really are.',
    ],
  },
  {
    emoji: '🏫',
    title: 'For Classrooms',
    body: [
      'Beyond solo focus, Lunaria Cafe is built for study groups and classrooms: instructors can create rooms, follow their students\' progress, run synchronized live focus sessions, and everyone competes on friendly leaderboards.',
    ],
  },
  {
    emoji: '🔒',
    title: 'Privacy',
    body: [
      'The attention camera runs entirely in your browser. No video, images, or camera data ever leave your device — only your resulting focus score is part of your save.',
    ],
  },
  {
    emoji: '🧪',
    title: 'Version',
    body: [
      'Prototype v0.1 — "Focus & Flourish". Things may shift, break, or get cozier without warning.',
    ],
    footer: 'Source on GitHub: Shad0wzzPudding/Lunaria-Cafe',
  },
];

/* -------------------------------- Credits ------------------------------- */

// TODO(credits): fill in the real attribution lines below — art and
// music/ambience sources are placeholders until the author provides them.
const CREDITS_SECTIONS = [
  {
    emoji: '💻',
    title: 'Development',
    list: [
      ['Design & development', 'Thanita Thitakan, Sawastachod Siriphatum, and Pisitpong Srisuthangkul'],
      ['Built with', 'React, Vite, Tailwind CSS, Framer Motion, Supabase'],
      ['Attention AI', 'YOLO26 via ONNX Runtime Web + MediaPipe — running fully on-device'],
      ["Advisor", "Dr. Punyanuch Borwarnginn"],
    ],
  },
  {
    emoji: '🎨',
    title: 'Art',
    list: [
      ['Pixel art & illustrations', 'ChatGPT + DALL·E, by OpenAI'],
      ['Font', 'Silkscreen, by Jason Kottke (Google Fonts)'],
    ],
  },
  {
    emoji: '🎶',
    title: 'Music & Sound',
    list: [
      ['Background music', 'Mixkit, via Mixkit.co'],
      ['Ambience & sound effects', 'Pixabay, via Pixabay.com'],
    ],
  },
  {
    emoji: '💜',
    title: 'Thanks',
    body: [
      'And thank you — for letting a tiny cafe keep you company while you do the hard thing. ☕',
    ],
  },
];

/* ------------------------------- Rendering ------------------------------ */

function HelpSection({ section, index }) {
  return (
    <motion.section
      className="rounded-xl border border-border/40 bg-card/60 p-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index, ease: 'easeOut' }}
    >
      <h2 className="font-pixel text-sm text-foreground mb-3 flex items-center gap-2">
        <span aria-hidden="true">{section.emoji}</span>
        {section.title}
      </h2>
      <div className="space-y-2">
        {section.body?.map((p) => (
          <p key={p} className="font-body text-sm text-muted-foreground leading-relaxed">
            {p}
          </p>
        ))}
        {section.list && (
          <ul className="space-y-1.5 pl-1 pt-1">
            {section.list.map(([term, desc]) => (
              <li key={term} className="font-body text-sm text-muted-foreground leading-relaxed">
                <span className="text-foreground/90">{term}</span> — {desc}
              </li>
            ))}
          </ul>
        )}
        {section.footer && (
          <p className="font-body text-xs text-muted-foreground/80 italic pt-1">{section.footer}</p>
        )}
      </div>
    </motion.section>
  );
}

const TAB_CONTENT = {
  info: { sections: INFO_SECTIONS, outro: null },
  credits: { sections: CREDITS_SECTIONS, outro: null },
  tutorial: { sections: TUTORIAL_SECTIONS, outro: 'Now go on — the cafe is waiting for you. ☕' },
};

export default function Help() {
  const { state, dispatch } = useGame();
  const [tab, setTab] = useState('info');
  const [showLicense, setShowLicense] = useState(false);
  const { sections, outro } = TAB_CONTENT[tab];

  // One lifecycle for every signpost (glow, Lulys, the menu bubble): they all
  // retire when the envelope is actually OPENED, not when a button is merely
  // pressed — a press-based glow died on the first "pressed but closed
  // without reading" playtest, before its job was done.
  const letterUnread = !state.settings?.welcomeLetterOpened;

  return (
    <div className="min-h-screen bg-background">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30"
        style={{ background: PANEL_BRIGHT_BG }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">Lunaria Cafe</h1>

        <nav className="ml-auto flex gap-1" aria-label="Help pages">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`font-pixel text-xs px-3 py-1.5 rounded-md border transition-colors ${
                tab === t.id
                  ? 'border-primary/60 bg-primary/15 text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Lulys guides first-time visitors toward the letter — perched on the
          upper right by the scrollbar, pointing down it: "the letter is down
          there, keep scrolling". She retires together with the menu's mail
          bubble once the envelope is opened (welcomeLetterOpened). Wide
          screens only: the centered content column owns the middle on
          smaller ones and she'd overlap it. */}
      {letterUnread && (
        <motion.div
          className="hidden lg:block fixed top-[16vh] z-10 pointer-events-none select-none"
          // 3vw past the old right-6 anchor — a slight tuck toward the right
          // edge. One dial: smaller vw = further into the page.
          style={{ right: 'calc(1.5rem - 3vw)' }}
          initial={{ opacity: 0, x: 48 }}
          animate={{ opacity: 1, x: 0, y: [0, -6, 0] }}
          transition={{
            opacity: { duration: 0.7, delay: 0.4 },
            x: { duration: 0.7, delay: 0.4, ease: 'easeOut' },
            y: { repeat: Infinity, duration: 2.4, ease: 'easeInOut', delay: 1.1 },
          }}
        >
          {/* Speech bubble — left of her head, pixel tail pointing at her.
              Same visual language as the menu bubble / SessionSummary. */}
          <div
            className="absolute right-[82%] top-[38%] z-10 w-max whitespace-nowrap font-pixel text-[11px] leading-snug"
            style={{
              background: '#fef9f0',
              color: '#2a2040',
              border: '4px solid #2a2040',
              padding: '8px 12px',
              imageRendering: 'pixelated',
            }}
          >
            There&apos;s a surprise for you below ✨
            {/* Pixel tail — steps right toward Lulys */}
            <div style={{ position: 'absolute', right: '-11px', top: '50%', transform: 'translateY(-50%)' }}>
              <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: '4px', height: '22px', background: '#2a2040' }} />
              <div style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '14px', background: '#2a2040' }} />
              <div style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '7px', background: '#fef9f0', marginTop: '4px' }} />
            </div>
          </div>

          <img
            src="/assets/Character/lulys_pointingdown_side_right_transparent.png"
            alt=""
            aria-hidden="true"
            draggable={false}
            className="h-[40vh] w-auto drop-shadow-[0_4px_16px_rgba(0,0,0,0.35)]"
          />
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        <motion.main
          key={tab}
          className="max-w-2xl mx-auto p-6 pb-12 space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {sections.map((section, i) => (
            <HelpSection key={section.title} section={section} index={i} />
          ))}

          {tab === 'info' && (
            <motion.section
              className="rounded-xl border border-border/40 bg-card/60 p-5"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05 * sections.length, ease: 'easeOut' }}
            >
              <h2 className="font-pixel text-sm text-foreground mb-3 flex items-center gap-2">
                <span aria-hidden="true">💌</span>
                License Agreement
              </h2>
              <p className="font-body text-sm text-muted-foreground leading-relaxed mb-3">
                This project is developed under the National Software Contest (NSC) with support
                from NSTDA. A letter from Lulyssia explains the terms.
              </p>
              {/* Pulsing highlight until pressed once — the glow lives on a
                  wrapper so the Button's own hover/active styles stay intact. */}
              <motion.span
                className="inline-flex rounded-md"
                animate={letterUnread ? {
                  boxShadow: [
                    '0 0 5px 1px rgba(255, 214, 130, 0.25)',
                    '0 0 16px 5px rgba(255, 214, 130, 0.65)',
                    '0 0 5px 1px rgba(255, 214, 130, 0.25)',
                  ],
                } : { boxShadow: '0 0 0px 0px rgba(255, 214, 130, 0)' }}
                transition={letterUnread
                  ? { repeat: Infinity, duration: 2.4, ease: 'easeInOut' }
                  : { duration: 0.4 }}
              >
                <Button
                  variant="secondary"
                  onClick={() => setShowLicense(true)}
                  className="font-pixel text-xs gap-2"
                >
                  💌 Read the letter
                </Button>
              </motion.span>
            </motion.section>
          )}

          {outro && (
            <motion.p
              className="font-pixel text-xs text-muted-foreground/60 text-center pt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              {outro}
            </motion.p>
          )}
        </motion.main>
      </AnimatePresence>

      <AnimatePresence>
        {showLicense && <LicenseEnvelope onClose={() => setShowLicense(false)} />}
      </AnimatePresence>
    </div>
  );
}
