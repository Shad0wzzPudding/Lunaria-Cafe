import React, { useRef, useCallback } from 'react'
import { Toaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { AuthProvider } from '@/auth/AuthProvider'
import { useAuth } from '@/auth/useAuth'
import { GameProvider } from '@/lib/gameState/GameProvider.jsx'
import { useGame } from '@/lib/gameState/useGame'
import { useCafeAudio } from '@/lib/audio/useCafeAudio'
import Login from '@/pages/Login'
import RoleSelect from '@/pages/RoleSelect'
import InstructorDashboard from '@/pages/instructor/InstructorDashboard'
import MainMenu from '@/pages/MainMenu'
import CafeView from '@/pages/CafeView'
import Statistics from '@/pages/Statistics'
import MyClassrooms from '@/pages/MyClassrooms'
import Friends from '@/pages/Friends'
import VisitCafe from '@/pages/VisitCafe'
import LeaderboardPage from '@/pages/LeaderboardPage'
import { LiveRoundProvider } from '@/lib/liveRound/LiveRoundProvider'
import GameSettings from '@/pages/GameSettings'
import Help from '@/pages/Help'
import CafeLoadingScreen from '@/pages/CafeLoadingScreen'
import CafeStatusPopup from '@/pages/CafeStatusPopup'
import DebugPanel from '@/components/debug/DebugPanel'
import SessionLockNotice from '@/components/session/SessionLockNotice'
import WelcomeGate from '@/components/WelcomeGate'
import NscNotice from '@/components/NscNotice'
import ErrorBoundary from '@/components/ErrorBoundary'
import SystemNotice from '@/components/SystemNotice'
import { useSessionLock } from '@/lib/session/useSessionLock'
import { playDancePadNote } from '@/lib/audio/cafeAudioEngine'
import { Sounds } from '@/lib/sounds'
import { applyThemeForTimeOfDay } from '@/lib/theme/themeDeriver'
import { KONAMI } from '@/lib/ui/useKonamiCode'

function GameRouter() {
  const { state, dispatch } = useGame()
  useCafeAudio()

  const [debugOpen,  setDebugOpen]  = React.useState(false)
  const [easyDebug,  setEasyDebug]  = React.useState(false)
  const konamiRef      = React.useRef([])
  const easyEnterRef   = React.useRef(0)
  const phaseRef       = React.useRef(state.phase)
  const easyDebugRef   = React.useRef(easyDebug)
  // Adjust-during-render (react.dev "storing information from previous
  // renders"): leaving the settings page turns the debug switch back off.
  const [prevPhase, setPrevPhase] = React.useState(state.phase)
  if (prevPhase !== state.phase) {
    setPrevPhase(state.phase)
    if (state.phase !== 'settings') setEasyDebug(false)
  }
  React.useEffect(() => { phaseRef.current = state.phase }, [state.phase])
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
          {/* The cafe is by far the biggest tree — canvas, AI camera, live
              rounds — so it is where a crash is most likely. Its own boundary
              means one goes no further than the cafe: the player lands back on
              the menu with the app alive and the save intact, instead of
              losing the whole page. */}
          <ErrorBoundary
            title="The cafe needs a moment"
            message="Something went wrong inside the cafe. Your coins, furniture and progress are safe — the menu is still there."
            resetLabel="Back to the menu"
            onReset={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          >
            <CafeView />
          </ErrorBoundary>
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
      {phase === 'friends'    && <Friends />}
      {phase === 'visiting'   && <VisitCafe />}
      {phase === 'leaderboard' && <LeaderboardPage />}
      {phase === 'settings' && <GameSettings />}
      {phase === 'help'     && <Help />}

      {debugOpen && <DebugPanel onClose={() => setDebugOpen(false)} />}
    </>
  )
}

function AppShell() {
  const { user, loading, profileLoading, isGuest, profile, activeRole, signOut } = useAuth()

  // One running instance per account. Hooks can't sit behind the early returns
  // below, so this always runs — but it is only ACTED on in the game branch,
  // which is why instructors (who return earlier, and whose dashboard has no
  // autosave to clobber) are never blocked.
  // GameProvider registers its saveNow here so the lock can flush before
  // handing over to another tab. A ref (not a prop callback) because the lock
  // is set up above the provider that supplies the function.
  const flushRef = useRef(null)
  const flushSave = useCallback(() => flushRef.current?.(), [])
  const { status: lockStatus, handingOver, takeOver, releaseDevice, clearDisplaced } =
    useSessionLock({
      userId: isGuest ? null : user?.id,
      // Device lock is students-only; guests have no account to claim, though the
      // tab lock still covers them (a guest save clobbers just the same).
      isStudent: !isGuest && Boolean(profile?.is_student),
      onBeforeRelease: flushSave,
    })

  // Displaced → sign out AND leave the displaced state, or logging back in
  // lands straight back on the notice with no way forward but a reload.
  const handleDisplacedSignOut = async () => {
    await signOut()
    clearDisplaced()
  }

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
      // Instructors have no save to carry an acknowledgement, so theirs is
      // stamped on the profile. The notice REPLACES the dashboard rather than
      // floating over it — nothing behind to tab into, so it needs no inert
      // wrapper, and it reads as a document rather than a dialog.
      //
      // A dual-role account is asked twice — here as instructor, and again by
      // WelcomeGate as a student. That looks like a bug and is not: the
      // players' letter is also the starter-pack ceremony, so it cannot be
      // skipped on the strength of this stamp. The two also say different
      // things (whose device the camera runs on).
      if (!profile.nsc_consent_at) {
        return <NscNotice />
      }
      return (
        <QueryClientProvider client={queryClientInstance}>
          <InstructorDashboard />
          {/* The instructor branch returns before the student tree below, so
              it needs its own Toaster — without one, any toast() from here (or
              from RoundHistory / RoundLeaderboard / InstructorRoundControl,
              which are shared with the student side) silently goes nowhere. */}
          <div className="dark"><Toaster theme="dark" expand /></div>
        </QueryClientProvider>
      )
    }
  }

  // Block BEFORE the game tree mounts. This is the part that actually protects
  // the save: GameProvider is never mounted while another instance owns the
  // lock, so its 30s autosave and exit save don't exist to overwrite
  // the active one. It also means the winner mounts fresh and loads the latest
  // save, rather than holding stale state from before the handover.
  if (lockStatus === 'checking') {
    return (
      <p className="min-h-screen flex items-center justify-center bg-background dark text-muted-foreground font-body">
        Loading…
      </p>
    )
  }
  if (lockStatus !== 'active') {
    return (
      <SessionLockNotice
        status={lockStatus}
        busy={handingOver}
        onAction={lockStatus === 'displaced' ? handleDisplacedSignOut : takeOver}
      />
    )
  }

  return (
    <QueryClientProvider client={queryClientInstance}>
      <GameProvider
        userId={isGuest ? null : user?.id}
        onBeforeSignOut={releaseDevice}
        flushRef={flushRef}
      >
        <LiveRoundProvider>
          <main className="dark min-h-screen relative">
            {/* Wraps rather than replaces the router, so the letter arrives on
                top of the menu the player is about to enter — and holds that
                menu inert underneath until the letter has been agreed to. */}
            <WelcomeGate>
              <GameRouter />
            </WelcomeGate>
            {/* Outside the gate's children on purpose — the gate marks them
                inert, and a save failure has to stay readable and retryable
                whatever else is on screen. */}
            <SystemNotice />
          </main>
        </LiveRoundProvider>
      </GameProvider>
      <div className="dark"><Toaster theme="dark" expand /></div>
    </QueryClientProvider>
  )
}

function App() {
  if (window.name === 'cafe-status-popup') {
    return <CafeStatusPopup />;
  }
  // Outermost net: catches anything the inner boundary doesn't, including a
  // crash in AuthProvider itself. No onReset — at this level there is no known
  // good state to return to, so reloading is the honest offer.
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ErrorBoundary>
  )
}

export default App
