import React, { useMemo } from 'react';
import { useGame } from '@/lib/gameState.jsx';

export default function ParticleOverlay() {
  const { state } = useGame();
  
  const particles = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      delay: `${Math.random() * 5}s`,
      duration: `${4 + Math.random() * 6}s`,
      size: 2 + Math.random() * 3,
    }));
  }, []);
  
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full animate-drift opacity-30"
          style={{
            left: p.left,
            top: p.top,
            width: p.size,
            height: p.size,
            background: state.attention.chaosLevel >= 2 
              ? 'hsl(265 60% 65%)' 
              : 'hsl(45 30% 80%)',
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
      
      {/* Rain streaks overlay */}
      {state.audio.rainEnabled && (
        <div className="absolute inset-0 opacity-5" 
          style={{
            background: 'repeating-linear-gradient(90deg, transparent, transparent 5px, rgba(140,170,220,0.3) 5px, rgba(140,170,220,0.3) 6px)',
            animation: 'drift 2s linear infinite',
          }}
        />
      )}
    </div>
  );
}