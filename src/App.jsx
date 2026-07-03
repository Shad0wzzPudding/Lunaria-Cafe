import React from 'react'
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { AuthProvider, useAuth } from '@/auth/AuthProvider'
import { GameProvider, useGame } from '@/lib/gameState/GameProvider.jsx'
import { useCafeAudio } from '@/lib/audio/useCafeAudio'
import Login from '@/pages/Login'
import RoleSelect from '@/pages/RoleSelect'
import InstructorDashboard from '@/pages/instructor/InstructorDashboard'
import MainMenu from '@/pages/MainMenu'
import CafeView from '@/pages/CafeView'
import Statistics from '@/pages/Statistics'
import MyClassrooms from '@/pages/MyClassrooms'
import GameSettings from '@/pages/GameSettings'
import CafeLoadingScreen from '@/pages/CafeLoadingScreen'
import CafeStatusPopup from '@/pages/CafeStatusPopup'
import DebugPanel from '@/components/debug/DebugPanel'
import { playDancePadNote } from '@/lib/audio/cafeAudioEngine'
import { Sounds } from '@/lib/sounds'
import { applyThemeForTimeOfDay } from '@/lib/theme/themeDeriver'

const KONAMI = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a','Enter']

function GameRouter() {
  const { state } = useGame()
  useCafeAudio()

  const [debugOpen,  setDebugOpen]  = React.useState(false)
  const [easyDebug,  setEasyDebug]  = React.useState(false)
  const konamiRef      = React.useRef([])
  const easyEnterRef   = React.useRef(0)
  const phaseRef       = React.useRef(state.phase)
  const easyDebugRef   = React.useRef(easyDebug)
  React.useEffect(() => {
    phaseRef.current = state.phase
    if (state.phase !== 'settings') setEasyDebug(false)
  }, [state.phase])
  React.useEffect(() => { easyDebugRef.current = easyDebug }, [easyDebug])

  const openDebug = React.useCallback(() => {
    setDebugOpen(true)
    Sounds.debugToolOpen(0.8, 0.9, true)
  }, [])

  React.useEffect(() => {
    const handleKey = (e) => {
      if (phaseRef.current !== 'settings') {
        konamiRef.current    = []
        easyEnterRef.current = 0
        return
      }

      // Switch not yet ON — listen for Enter ×3 to flip it on
      if (!easyDebugRef.current) {
        if (e.key === 'Enter') {
          easyEnterRef.current += 1
          playDancePadNote('Enter')
          if (easyEnterRef.current >= 3) {
            easyEnterRef.current = 0
            setEasyDebug(true)
          }
        } else {
          easyEnterRef.current = 0
        }
        return
      }

      // Switch is ON — accept the full Konami sequence
      const seq      = konamiRef.current
      const expected = KONAMI[seq.length]
      if (e.key === expected) {
        const next = [...seq, e.key]
        konamiRef.current = next
        playDancePadNote(e.key)
        if (next.length === KONAMI.length) {
          konamiRef.current = []
          openDebug()
        }
      } else if (e.key === KONAMI[0]) {
        konamiRef.current = [e.key]
        playDancePadNote(e.key)
      } else {
        konamiRef.current = []
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [openDebug])

  // Switch theme when the cafe transitions between day and night.
  const timeOfDay = state.cafe?.timeOfDay ?? 'day';
  React.useEffect(() => {
    applyThemeForTimeOfDay(timeOfDay);
  }, [timeOfDay]);

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

      {phase === 'menu'       && <MainMenu />}
      {phase === 'stats'      && <Statistics />}
      {phase === 'classrooms' && <MyClassrooms />}
      {phase === 'settings' && <GameSettings easyDebug={easyDebug} setEasyDebug={setEasyDebug} />}

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </>
  )
}

function AppShell() {
  const { user, loading, profileLoading, isGuest, profile, activeRole } = useAuth()

  if (loading || (user && profileLoading)) {
    return (
      <p className="min-h-screen flex items-center justify-center bg-background dark text-muted-foreground font-body">
        Loading…
      </p>
    )
  }

  if (!user && !isGuest) {
    return <Login />
  }

  // Instructor routing (guests are always students).
  // Dual-role accounts pick a side each session; instructor-only
  // accounts go straight to the dashboard and never see the game.
  if (!isGuest && profile?.is_instructor) {
    if (profile.is_student && !activeRole) return <RoleSelect />
    if (activeRole === 'instructor' || !profile.is_student) {
      return (
        <QueryClientProvider client={queryClientInstance}>
          <InstructorDashboard />
        </QueryClientProvider>
      )
    }
  }

  return (
    <QueryClientProvider client={queryClientInstance}>
      <GameProvider userId={isGuest ? null : user?.id}>
        <main className="dark min-h-screen relative">
          <GameRouter />
        </main>
      </GameProvider>
      <div className="dark"><Toaster theme="dark" /></div>
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
