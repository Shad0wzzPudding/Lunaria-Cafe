import React from 'react'
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { GameProvider, useGame } from '@/lib/gameState/GameProvider.jsx'
import { useCafeAudio } from '@/lib/audio/useCafeAudio'
import Login from '@/pages/Login'
import MainMenu from '@/pages/MainMenu'
import CafeView from '@/pages/CafeView'
import Statistics from '@/pages/Statistics'
import GameSettings from '@/pages/GameSettings'
import CafeLoadingScreen from '@/pages/CafeLoadingScreen'
import CafeStatusPopup from '@/pages/CafeStatusPopup'

function GameRouter() {
  const { state } = useGame()
  useCafeAudio()

  const phase = state.phase
  const isCafePhase = phase === 'loading' || phase === 'management' || phase === 'focus'

  // Delay mounting CafeView by 100ms after loading starts so Radix UI
  // contexts are fully initialised before Dialog components render.
  const [cafeReady, setCafeReady] = React.useState(false)

  React.useEffect(() => {
    if (isCafePhase) {
      const t = setTimeout(() => setCafeReady(true), 100)
      return () => clearTimeout(t)
    }
  }, [isCafePhase])

  // Only show CafeView while we're actually in a cafe-related phase.
  // (Using && here — not || — so it unmounts once phase leaves loading/management/focus.)
  const showCafe = cafeReady && isCafePhase

  return (
    <>
      {showCafe && (
        <div style={{
          pointerEvents: phase === 'loading' ? 'none' : 'auto',
          position: phase === 'loading' ? 'absolute' : 'relative',
          visibility: phase === 'loading' ? 'hidden' : 'visible',
          inset: 0,
          zIndex: 0,
        }}>
          <CafeView />
        </div>
      )}

      {phase === 'loading' && (
        <div className="absolute inset-0 z-50">
          <CafeLoadingScreen />
        </div>
      )}

      {phase === 'menu'     && <MainMenu />}
      {phase === 'stats'    && <Statistics />}
      {phase === 'settings' && <GameSettings />}
    </>
  )
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
        <main className="dark min-h-screen relative">
          <GameRouter />
        </main>
      </GameProvider>
      <Toaster />
    </QueryClientProvider>
  )
}

function App() {
  if (window.name === 'cafe-status-popup') {
    return <CafeStatusPopup />;
  }
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

export default App
