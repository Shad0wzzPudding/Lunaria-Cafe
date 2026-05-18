import React, { useState } from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Users } from 'lucide-react';

export default function NPCPanel() {
  const { state } = useGame();
  const [selectedNPC, setSelectedNPC] = useState(null);
  
  return (
    <Dialog>
      <DialogTrigger asChild>
  <div
    role="button"
    tabIndex={0}
    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-foreground/70 hover:text-foreground hover:bg-accent cursor-pointer transition-colors"
  >
    <Users className="w-4 h-4" />
    <span className="font-pixel text-xs">Visitors</span>
  </div>
</DialogTrigger>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl text-foreground">Cafe Regulars</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {state.npcs.major.map(npc => (
            <button
              key={npc.id}
              onClick={() => setSelectedNPC(selectedNPC?.id === npc.id ? null : npc)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${
                selectedNPC?.id === npc.id 
                  ? 'border-primary bg-primary/10' 
                  : 'border-border/50 bg-secondary/30 hover:bg-secondary/60'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{npc.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-semibold text-foreground">{npc.name}</div>
                  <div className="text-xs text-muted-foreground">{npc.role}</div>
                </div>
              </div>
              {selectedNPC?.id === npc.id && (
                <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5 text-sm text-foreground/80">
                  <p><span className="text-muted-foreground">Personality:</span> {npc.personality}</p>
                  <p><span className="text-muted-foreground">Visits:</span> {npc.schedule}</p>
                  <p><span className="text-muted-foreground">Favorite:</span> {npc.favoriteOrder}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}