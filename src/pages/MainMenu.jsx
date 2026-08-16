import { useState } from 'react';
import { useGame } from '@/lib/gameState/useGame';
import { useAuth } from '@/auth/useAuth';
import { useLiveRound } from '@/lib/liveRound/useLiveRound';
import { Button } from '@/components/ui/button';
import { Play, BarChart3, Settings, BookOpen, Users, Radio, Pencil, Check, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { useNameDraft, MAX_DISPLAY_NAME } from '@/lib/account/useNameDraft';
import FriendNoticeBubble from '@/components/friends/FriendNoticeBubble';
import { useFriendNotices, noticeMessage } from '@/lib/friends/notices';

// Inline name editor that pops out of the greeting when the pencil is pressed.
// Mounted only while editing, so each open starts fresh from the current name.
function MenuNameEditor({ current, onSave, onClose }) {
  const { name, onChange, status, error, canSave, save } = useNameDraft(current, onSave);

  const submit = async () => {
    const { error: err } = await save();
    if (!err) onClose();
  };

  return (
    <span className="flex items-center gap-1.5">
      <input
        autoFocus
        value={name}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') onClose();
        }}
        maxLength={MAX_DISPLAY_NAME}
        placeholder="Your name"
        aria-label="Your name"
        className="font-pixel text-xs bg-white/10 border border-white/30 rounded px-2 py-1 text-white placeholder:text-white/40 focus:outline-none focus:border-white/60 drop-shadow-md"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!canSave}
        title="Save name"
        aria-label="Save name"
        className="text-emerald-300/80 hover:text-emerald-300 disabled:opacity-30 disabled:hover:text-emerald-300/80 transition-colors drop-shadow-md"
      >
        <Check className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onClose}
        title="Cancel"
        aria-label="Cancel"
        className="text-white/45 hover:text-white transition-colors drop-shadow-md"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {status === 'error' && (
        <span className="font-pixel text-[10px] text-amber-300 drop-shadow-md">{error}</span>
      )}
    </span>
  );
}

export default function MainMenu() {
  const { dispatch, logout } = useGame();
  const { user, profile, isGuest, chooseRole, updateDisplayName } = useAuth();
  const { currentRound } = useLiveRound();
  const [editingName, setEditingName] = useState(false);
  const canSwitchToInstructor = !isGuest && profile?.is_student && profile?.is_instructor;
  // Classrooms, friends and renaming are all student-account features, and a
  // guest has no account at all — so they share one condition rather than
  // three copies of it that could drift apart.
  const isStudentAccount = !isGuest && Boolean(profile?.is_student);
  const canUseClassrooms = isStudentAccount;
  const canUseFriends = isStudentAccount;
  const canEditName = isStudentAccount;
  const { newRequests, newResults } = useFriendNotices(canUseFriends);

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Wallpaper */}
      <img
        src="/assets/Backdrop/mainmenu_wallpaper"
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center select-none"
        draggable={false}
      />

      {/* Gradient overlays — darken bottom and left edge for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-black/10 to-transparent" />

      {/* Signed-in indicator — top-left */}
      <motion.div
        className="absolute top-4 left-4 z-20 flex items-baseline gap-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.2 }}
      >
        {editingName && canEditName ? (
          <MenuNameEditor
            current={profile?.display_name || user?.email?.split('@')[0] || 'Student'}
            onSave={updateDisplayName}
            onClose={() => setEditingName(false)}
          />
        ) : (
          <>
            <p className="font-pixel text-xs text-white/70 drop-shadow-md">
              The cafe welcomes you, {isGuest ? 'Guest' : (profile?.display_name || user?.email)}!
            </p>
            {canEditName && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                title="Edit your name"
                aria-label="Edit your name"
                className="text-white/45 hover:text-white transition-colors drop-shadow-md"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </>
        )}
        <button
          type="button"
          onClick={logout}
          className="font-pixel text-xs text-white/45 underline underline-offset-2 hover:text-white transition-colors drop-shadow-md"
        >
          Log out
        </button>
      </motion.div>

      {/* Icon buttons — bottom-right, out of the menu column's way. One flex
          row rather than two absolutely-placed buttons, so Friends sits beside
          Help without either having to know the other's width, and Help keeps
          its corner when Friends isn't there (guests, instructor-only). */}
      <div className="absolute bottom-6 right-6 z-20 flex items-center gap-3">
        {/* 3.43rem is 98% of Help's w-14 (3.5rem). The friends plaque fills
            more of its canvas than the help one does — 71% against 64% — so
            equal boxes make it read as the larger of the pair; this trims it
            back. Keep it a LITERAL class string: Tailwind emits arbitrary
            values by scanning source text, so one assembled from a variable
            never reaches the CSS (see lib/ui/cardGrid.js). */}
        {canUseFriends && (
          // relative: the notice bubble anchors to THIS button rather than to
          // the screen, so it keeps its aim if the button moves or resizes.
          <div className="relative">
            <FriendNoticeBubble
              message={noticeMessage(newRequests, newResults)}
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'friends' })}
            />
            <motion.button
              type="button"
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'friends' })}
              className="block w-[3.43rem] h-[3.43rem] select-none transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg"
              title="Friends"
              aria-label="Friends"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.2, delay: 0.5 }}
            >
              <img
                src="/assets/button/friends.png"
                alt=""
                className="w-full h-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
                draggable={false}
              />
            </motion.button>
          </div>
        )}

        <motion.button
          type="button"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'help' })}
          className="w-14 h-14 select-none transition-transform hover:scale-110 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-lg"
          title="Info, credits & tutorial"
          aria-label="Info, credits & tutorial"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.5 }}
        >
          <img
            src="/assets/button/help.png"
            alt=""
            className="w-full h-full drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]"
            draggable={false}
          />
        </motion.button>
      </div>

      {/* Menu content — anchored to bottom-left */}
      <motion.div
        className="relative z-10 flex flex-col justify-end min-h-screen pb-12 pl-10 md:pb-16 md:pl-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2 }}
      >
        <motion.div
          className="flex flex-col gap-7 max-w-xs"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.3, ease: 'easeOut' }}
        >
          {/* Title */}
          <div className="space-y-1.5">
            <h1 className="font-pixel text-5xl font-bold text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] leading-tight">
              Lunaria Cafe
            </h1>
            <p className="font-pixel text-sm text-white/55 drop-shadow-md">
              A tiny magical world quietly waiting beside you.
            </p>
            {currentRound && (
              <p className="font-pixel text-xs text-emerald-300 drop-shadow-md flex items-center gap-1.5 pt-1">
                <Radio className="w-3.5 h-3.5" />
                You're in the live-session of {currentRound.scope_name}!
              </p>
            )}
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-2.5">
            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'loading' })}
              className="h-12 font-pixel text-sm tracking-wide gap-2 bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg shadow-black/40 border border-primary/30"
            >
              <Play className="w-4 h-4" />
              Open Cafe
            </Button>

            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'stats' })}
              variant="secondary"
              className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
            >
              <BarChart3 className="w-4 h-4" />
              Statistics
            </Button>

            {canUseClassrooms && (
              <Button
                onClick={() => dispatch({ type: 'SET_PHASE', payload: 'classrooms' })}
                variant="secondary"
                className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
              >
                <Users className="w-4 h-4" />
                My Classrooms
              </Button>
            )}

            <Button
              onClick={() => dispatch({ type: 'SET_PHASE', payload: 'settings' })}
              variant="secondary"
              className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
            >
              <Settings className="w-4 h-4" />
              Settings
            </Button>

            {canSwitchToInstructor && (
              <Button
                onClick={() => chooseRole('instructor')}
                variant="secondary"
                className="h-11 font-pixel text-xs tracking-wide gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm shadow-md shadow-black/30"
              >
                <BookOpen className="w-4 h-4" />
                Switch to Instructor
              </Button>
            )}
          </div>

          <p className="font-body text-[11px] text-white/30">
            v.3 (Final round) — Focus & Flourish
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
