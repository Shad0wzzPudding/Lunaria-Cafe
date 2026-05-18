import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { GameProvider, useGame } from '@/lib/gameState.jsx';
import MainMenu from '@/pages/MainMenu';
import CafeView from '@/pages/CafeView';
import FocusSession from '@/pages/FocusSession';
import Statistics from '@/pages/Statistics';
import GameSettings from '@/pages/GaneSettings';

function GameRouter() {
  const { state } = useGame();
  
  switch (state.phase) {
    case 'menu':
      return <MainMenu />;
    case 'management':
    case 'focus':
      return <CafeView />;
    case 'stats':
      return <Statistics />;
    case 'settings':
      return <GameSettings />;
    default:
      return <MainMenu />;
  }
}

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <GameProvider>
        <div className="dark">
          <GameRouter />
        </div>
      </GameProvider>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App