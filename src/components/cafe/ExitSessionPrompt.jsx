import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getFocusPanelStyle } from '@/lib/theme/themeDeriver';

export default function ExitSessionPrompt({ onConfirm, onCancel, boostActive = false }) {
  // Escape cancels (keeps focusing), matching the backdrop-click behavior.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop — clicking it cancels (keeps focusing) */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      {/* Modal */}
      <motion.div
        className="relative z-10 w-full max-w-sm mx-4 rounded-2xl border border-border/50 bg-card/95 shadow-2xl backdrop-blur-md p-7 text-center"
        style={getFocusPanelStyle()}
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 16 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      >
        <div className="flex justify-center mb-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: 'rgba(244,63,94,0.1)', boxShadow: '0 0 0 1px rgba(244,63,94,0.35)' }}
          >
            <LogOut size={22} style={{ color: '#fb7185' }} strokeWidth={1.8} />
          </div>
        </div>

        <h2 className="font-display text-lg text-foreground mb-1">Leave the cafe?</h2>
        <p className="font-body text-sm text-muted-foreground mb-6">
          Your focus session will end and you won't earn a streak for it.
        </p>

        {/* A ticket is spent at session start and never refunded — leaving
            now forfeits it, so say so before the player commits. */}
        {boostActive && (
          <div
            className="mb-6 rounded-lg px-3 py-2.5 text-left"
            style={{ background: 'rgba(245,158,11,0.10)', boxShadow: '0 0 0 1px rgba(245,158,11,0.35)' }}
          >
            <p className="font-pixel text-[11px]" style={{ color: '#fbbf24' }}>
              🎟️ A focus boost is active
            </p>
            <p className="font-body text-xs text-muted-foreground mt-1">
              The ticket was spent when this session started and won't be refunded if you leave.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="secondary" className="flex-1 font-pixel text-xs" onClick={onCancel}>
            Keep focusing
          </Button>
          <Button variant="destructive" className="flex-1 font-pixel text-xs" onClick={onConfirm}>
            Exit
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
