import { useState } from 'react';
import { motion } from 'framer-motion';
import { Coins, Users, Heart, Sparkles } from 'lucide-react';
import { getChaosStage } from '@/lib/ai/aiIntegration';
import { ZEN_PICTURES } from './zenPictures';


function renderTip(text) {
  return text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <motion.div
      className="flex flex-col items-center gap-1.5 rounded-xl border border-border/30 bg-card/60 px-5 py-3 backdrop-blur-sm"
      whileHover={{ scale: 1.03 }}
    >
      <Icon size={16} strokeWidth={2} style={{ color }} />
      <span className="font-pixel text-base text-foreground">{value}</span>
      <span className="font-body text-[10px] text-muted-foreground">{label}</span>
    </motion.div>
  );
}

export default function ZenFocusView({ state }) {
  const chaos = getChaosStage(state.attention.score ?? 100);

  // Both picked once per mount, stay fixed for the session
  const [picture] = useState(() => ZEN_PICTURES[Math.floor(Math.random() * ZEN_PICTURES.length)]);
  const [tip]     = useState(() => picture.tips[Math.floor(Math.random() * picture.tips.length)]);

  const stats = [
    { icon: Coins,    label: 'Coins',       value: state.coins ?? 0,                                                    color: '#f0c674' },
    { icon: Heart,    label: 'Reputation',  value: `${state.reputation ?? 0}%`,                                         color: '#f0a0b8' },
    { icon: Users,    label: 'Customers',   value: `${state.cafe.currentCustomers ?? 0}/${state.cafe.maxCustomers ?? 8}`, color: '#9ec8e8' },
    { icon: Sparkles, label: 'Focus Score', value: state.attention.score ?? 100,                                         color: chaos.color },
  ];

  return (
    <div className="flex flex-col items-center justify-center gap-8 w-full h-full py-6">
      {/* GIF */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        className="relative"
      >
        <img
          src={picture.src}
          alt={picture.alt}
          className="rounded-2xl shadow-2xl object-contain"
          style={{ maxHeight: '320px', imageRendering: 'pixelated' }}
        />
        {/* soft glow beneath */}
        <div
          className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3/4 h-6 rounded-full blur-xl opacity-40"
          style={{ background: 'radial-gradient(ellipse, #a78bfa, transparent)' }}
        />
      </motion.div>

      {/* Pro tip */}
      <motion.div
        className="w-full max-w-sm rounded-2xl border border-border/30 bg-card/60 px-5 py-4 backdrop-blur-sm"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        <p className="font-pixel text-[10px] text-primary/70 uppercase tracking-widest mb-2">Pro tip</p>
        <p className="font-body text-xs text-foreground/80 leading-relaxed">
          {tip.emoji} {renderTip(tip.text)}
        </p>
      </motion.div>

      {/* Status bar */}
      <motion.div
        className="flex flex-wrap justify-center gap-3"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.5 }}
      >
        {stats.map((s) => (
          <StatCard key={s.label} icon={s.icon} label={s.label} value={s.value} color={s.color} />
        ))}
      </motion.div>

      <motion.p
        className="font-body text-xs text-muted-foreground/90 text-center rounded-full border border-border/20 bg-card/50 px-4 py-1.5 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.8 }}
      >
        Your cafe is running quietly in the background.
      </motion.p>
    </div>
  );
}
