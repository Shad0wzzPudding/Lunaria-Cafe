import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '@/lib/gameState/GameProvider.jsx';

const FILL_COLOR = '#876ade';

export default function ChaosGauge({ className = "absolute top-3 left-3 z-20 w-56 -translate-y-[20%]" }) {
  const { state } = useGame();
  const { chaosLevel } = state.attention;
  const isFocusing = state.focus.status === 'active' || state.focus.status === 'paused';

  return (
    <AnimatePresence>
      {isFocusing && (
        <motion.div
          className={`${className} select-none pointer-events-none`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative w-full" style={{ clipPath: 'inset(0 14% 0 0)' }}>
            {/* Fill bar — behind the PNG frame */}
            <div
              className="absolute overflow-hidden rounded-sm"
              style={{
                left:   '28%',
                top:    '41.5%',
                width:  '55%',
                height: '18%',
              }}
            >
              <motion.div
                className="h-full w-full origin-left rounded-sm"
                style={{ backgroundColor: FILL_COLOR }}
                animate={{ scaleX: chaosLevel / 3 }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>

            {/* PNG gauge frame on top */}
            <img
              src="/assets/UI/Chaos_gauge.png"
              alt=""
              draggable={false}
              className="relative w-full"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
