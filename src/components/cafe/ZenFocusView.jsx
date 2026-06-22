import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Coins, Users, Heart, Sparkles } from 'lucide-react';
import { getChaosStage } from '@/lib/ai/aiIntegration';

export const ZEN_PICTURES = [
  {
    src: '/assets/focus_picture/sitting_by_the_window.gif',
    alt: 'Sitting by the window',
    tips: [
      { emoji: '☀️', text: 'Natural light helps regulate your body clock and can improve alertness and mood. If you can, study where daylight reaches your desk.' },
      { emoji: '👀', text: 'Try the **20-20-20 rule**: every 20 minutes, look at something 20 feet away for 20 seconds to ease eye strain and give your focus a reset.' },
      { emoji: '🧠', text: "Short breaks aren't wasted time. Even 5 minutes away from your desk can restore attention and help your brain process what you've learned." },
      { emoji: '🌅', text: "Morning light is especially powerful. It helps set your circadian rhythm, making it easier to sleep well tonight and remember more tomorrow." },
    ],
  },
  {
    src: '/assets/focus_picture/coffee_on_table.gif',
    alt: 'Coffee on the table',
    tips: [
      { emoji: '⏰', text: 'If you like coffee, timing matters less than how it affects you. Some people find waiting 60–90 minutes after waking helps avoid energy crashes later.' },
      { emoji: '💧', text: 'Keep water nearby. Staying hydrated supports concentration, especially during long study sessions.' },
      { emoji: '😴', text: 'Try a **caffeine nap**: drink coffee, then rest for 15–20 minutes. The caffeine often kicks in as you wake, boosting alertness.' },
    ],
  },
  {
    src: '/assets/focus_picture/brewing_front_of_window.gif',
    alt: 'Brewing by the window',
    tips: [
      { emoji: '🍵', text: 'Green tea offers a gentler lift than coffee, with caffeine and **L-theanine** working together to support calm focus. For a smoother cup, brew around 70–80°C for 2–3 minutes.' },
      { emoji: '🌿', text: 'The act of making tea can be a useful pause, a small ritual that helps you slow down and reset before deep work.' },
      { emoji: '🌙', text: 'Before bed, chamomile tea may help you relax and support better sleep quality, which plays a key role in memory and learning.' },
    ],
  },
];

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
  const picture = useRef(ZEN_PICTURES[Math.floor(Math.random() * ZEN_PICTURES.length)]).current;
  const tip     = useRef(picture.tips[Math.floor(Math.random() * picture.tips.length)]).current;

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
        className="font-body text-xs text-muted-foreground/60 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Your cafe is running quietly in the background.
      </motion.p>
    </div>
  );
}
