import React from 'react';
import { useGame } from '@/lib/gameState.jsx';
import StatsCharts from '@/components/stats/StatsCharts';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Statistics() {
  const { dispatch } = useGame();
  
  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border/30 bg-card/40 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">Statistics</h1>
      </header>
      
      <motion.main 
        className="max-w-2xl mx-auto p-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <StatsCharts />
      </motion.main>
    </div>
  );
}