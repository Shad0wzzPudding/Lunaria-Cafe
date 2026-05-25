import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { AuthProvider, useAuth } from '@/lib/AuthProvider'
import { GameProvider, useGame } from '@/lib/gameState.jsx'
import { useCafeAudio } from '@/lib/useCafeAudio'
import Login from '@/lib/Login'
import MainMenu from '@/pages/MainMenu'
import CafeView from '@/pages/CafeView'
import Statistics from '@/pages/Statistics'
import GameSettings from '@/pages/GaneSettings'
import SessionSummary from '@/lib/SessionSummary'

function GameRouter() {
  const { state } = useGame()
  useCafeAudio()

  switch (state.phase) {
    case 'menu':
      return <MainMenu />
    case 'management':
    case 'focus':
      return <CafeView />
    case 'summary':          
      return <SessionSummary />
    case 'stats':
      return <Statistics />
    case 'settings':
      return <GameSettings />
    default:
      return <MainMenu />
  }
}

function AppShell() {
  const { user, loading, isGuest } = useAuth()

  if (loading) {
    return (
      <p className="min-h-screen flex items-center justify-center bg-background dark text-muted-foreground font-body">
        Loading…
      </p>
    )
  }

  if (!user && !isGuest) {
    return <Login />
  }

  return (
    <QueryClientProvider client={queryClientInstance}>
      <GameProvider userId={isGuest ? null : user?.id}>
        <main className="dark min-h-screen">
          <GameRouter />
        </main>
      </GameProvider>
      <Toaster />
    </QueryClientProvider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
