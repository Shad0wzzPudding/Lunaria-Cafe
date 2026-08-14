import { motion } from 'framer-motion';
import { PIXEL_CORNERS } from '@/components/letter/pixelBox';

/**
 * The nudge above the Friends plaque when something is waiting.
 *
 * Deliberately the same gesture as "Click to open the letter" under the welcome
 * envelope — pixel type, a slow pulse, no button chrome — because it is doing
 * the same job: pointing at a thing to open rather than being a thing itself.
 *
 * Positioned against the Friends button (its parent is relative), not against
 * the screen, so it keeps its aim if that button ever moves or resizes.
 */
export default function FriendNoticeBubble({ message, onClick }) {
  if (!message) return null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      // bottom-full + right-0: the bubble hangs above the plaque and grows
      // leftward into empty sky, rather than rightward over the Help button.
      //
      // mb-[0.58rem] rather than mb-3: sitting 3% lower. The bubble's underside
      // was 90.9px above the viewport floor (24px inset + 54.9px plaque + 12px
      // gap); 3% of that is 2.7px, taken out of the gap so the text stays on
      // whole pixels — nudging it with translate-y would land on a half pixel
      // and soften the pixel font.
      className="absolute bottom-full right-0 mb-[0.58rem] z-10 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      style={{ clipPath: PIXEL_CORNERS('6px') }}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.9 }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      aria-label={`${message} Open your friends.`}
    >
      <span
        className="block px-3 py-2"
        style={{ clipPath: PIXEL_CORNERS('6px'), background: '#7a5230', padding: '3px' }}
      >
        <motion.span
          className="block px-3 py-1.5 font-pixel text-[11px]"
          style={{ clipPath: PIXEL_CORNERS('6px'), background: '#e8cf9e', color: '#6b4a26' }}
          animate={{ opacity: [0.72, 1, 0.72] }}
          transition={{ duration: 1.8, repeat: Infinity }}
        >
          {message}
        </motion.span>
      </span>

      {/* Tail, aimed at the middle of the Friends plaque.
          The offset is to the tail's RIGHT EDGE, so half the tail's own 14px
          width has to come out of it: the plaque's centre sits 27.44px in
          (3.43rem ÷ 2), minus 7px, is 20.4px — 1.28rem. Setting this to the
          plaque's half-width alone points 6.8px too far left. */}
      <span
        aria-hidden
        className="absolute top-full right-[1.28rem] -mt-px h-0 w-0"
        style={{
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderTop: '8px solid #7a5230',
        }}
      />
    </motion.button>
  );
}
