import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/useAuth';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import SearchInput from '@/components/ui/SearchInput';
import { BookOpen, GraduationCap, LogOut, Users, KeyRound, RefreshCw, Trash2, Plus, ChevronRight, Globe, Lock, Hash, Copy, Check } from 'lucide-react';
import ClassroomDetail from './ClassroomDetail';
import { INSTRUCTOR_PAGE_BG, INSTRUCTOR_PAGE_INK as PAGE_INK } from '@/lib/theme/themeDeriver';
import { ROOM_GRID_WIDE } from '@/lib/ui/cardGrid';

async function fetchMyClassrooms() {
  const { data, error } = await supabase
    .from('classrooms')
    .select('*, classroom_members(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((room) => ({
    ...room,
    member_count: room.classroom_members?.[0]?.count ?? 0,
  }));
}

function RoomList({ onOpen }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [newIsPublic, setNewIsPublic] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [copyFailedId, setCopyFailedId] = useState(null);

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['my-classrooms'],
    queryFn: fetchMyClassrooms,
  });

  // Before the early returns below — hooks can't be conditional.
  const filtered = useMemo(() => {
    const list = rooms ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((room) => room.name.toLowerCase().includes(q));
  }, [rooms, search]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });

  const createMutation = useMutation({
    mutationFn: async ({ name, isPublic }) => {
      const { error } = await supabase
        .from('classrooms')
        .insert({ name, instructor_id: user.id, is_public: isPublic });
      if (error) throw error;
    },
    onSuccess: () => { setNewName(''); setFormError(''); refresh(); },
    onError: (err) => setFormError(err.message || 'Could not create classroom.'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (roomId) => {
      const { error } = await supabase.from('classrooms').delete().eq('id', roomId);
      if (error) throw error;
    },
    onSuccess: () => { setDeletingId(null); refresh(); },
  });

  const regenPinMutation = useMutation({
    mutationFn: async (roomId) => {
      const { error } = await supabase.rpc('regenerate_pin', { _classroom_id: roomId });
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  if (isLoading) return <p className={`text-sm ${PAGE_INK} text-center py-10`}>Loading classrooms…</p>;
  if (error) return <p className="text-sm text-amber-700 text-center py-10">Could not load classrooms: {error.message}</p>;

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name) createMutation.mutate({ name, isPublic: newIsPublic });
        }}
      >
        <input
          type="text"
          placeholder="New classroom name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
          className="min-w-48 flex-1 rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          required
        />
        {/* Visibility is set at creation. Private rooms stay out of the
            student browse list; they're reached by code or invitation. */}
        <div className="flex overflow-hidden rounded-md border border-border/40">
          <button
            type="button"
            onClick={() => setNewIsPublic(true)}
            title="Listed for every student to find and join"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs ${newIsPublic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Globe className="h-3 w-3" />
            Public
          </button>
          <button
            type="button"
            onClick={() => setNewIsPublic(false)}
            title="Hidden from the browse list — joined by code or invitation"
            className={`flex items-center gap-1 px-2.5 py-1 text-xs ${!newIsPublic ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <Lock className="h-3 w-3" />
            Private
          </button>
        </div>
        <Button type="submit" disabled={createMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {createMutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </form>
      {formError && <p className="text-xs text-amber-700">{formError}</p>}

      {/* Only worth showing once the list is long enough to hunt through. */}
      {rooms.length > 5 && (
        <SearchInput value={search} onChange={setSearch} placeholder="Search your classrooms…" />
      )}

      {rooms.length === 0 ? (
        <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
          No classrooms yet — create your first one above. Students join with the room's PIN, or you invite them by email.
        </div>
      ) : filtered.length === 0 ? (
        <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
          No classrooms match "{search}".
        </div>
      ) : (
        // Card grid, matching the student side — a full-width row per
        // classroom wasted most of the line on an instructor with several.
        <div className={ROOM_GRID_WIDE}>
          {filtered.map((room) => (
            <div key={room.id} className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(room)}
                  className="flex items-center gap-2 min-w-0 text-left group"
                >
                  {/* Truncated to fit the card, so hovering reveals the rest. */}
                  <span
                    className="font-display text-sm text-foreground truncate group-hover:text-primary transition-colors"
                    title={room.name}
                  >
                    {room.name}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
                {/* Private rooms don't appear in the student browse list, so
                    say so plainly — otherwise "nobody is joining" looks like
                    a bug rather than the setting working. */}
                <span
                  className={`flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                    room.is_public
                      ? 'bg-emerald-500/15 text-emerald-600'
                      : 'bg-amber-500/15 text-amber-600'
                  }`}
                  title={
                    room.is_public
                      ? 'Listed for every student to find'
                      : 'Hidden from the browse list — students join by code or invitation'
                  }
                >
                  {room.is_public ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {room.is_public ? 'Public' : 'Private'}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Users className="h-3.5 w-3.5" />
                  {room.member_count}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {/* Students need BOTH to join by code, so they're shown
                      together and copy together. */}
                  <Hash className="h-3.5 w-3.5" />
                  Code: <span className="font-semibold tracking-widest text-foreground/90">{room.class_code}</span>
                  <button
                    type="button"
                    title="Copy code and PIN"
                    onClick={async () => {
                      // navigator.clipboard is undefined on insecure origins,
                      // which includes serving this over plain http on a
                      // classroom LAN. Optional-chaining alone would resolve
                      // quietly and still flash the tick, telling the
                      // instructor it copied when nothing did — so confirm
                      // only on a real success, and surface the failure.
                      try {
                        if (!navigator.clipboard) throw new Error('unavailable');
                        await navigator.clipboard.writeText(
                          `Class code: ${room.class_code}  ·  PIN: ${room.join_pin}`,
                        );
                        setCopyFailedId(null);
                        setCopiedId(room.id);
                        setTimeout(() => setCopiedId((v) => (v === room.id ? null : v)), 1500);
                      } catch {
                        // Reported on THIS card, not via setFormError — that
                        // renders under the create form at the top of the page,
                        // nowhere near the button that failed. (A toast isn't
                        // an option either: the instructor route returns before
                        // App mounts the Toaster.)
                        setCopyFailedId(room.id);
                      }
                    }}
                    className="text-muted-foreground/60 transition-colors hover:text-foreground"
                  >
                    {copiedId === room.id ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  </button>
                  <span className="text-muted-foreground/40">|</span>
                  <KeyRound className="h-3.5 w-3.5" />
                  PIN: <span className="font-semibold tracking-widest text-foreground/90">{room.join_pin}</span>
                  <button
                    type="button"
                    title="Generate a new PIN"
                    onClick={() => regenPinMutation.mutate(room.id)}
                    disabled={regenPinMutation.isPending}
                    className="text-muted-foreground/60 hover:text-foreground transition-colors"
                  >
                    <RefreshCw className={`h-3 w-3 ${regenPinMutation.isPending ? 'animate-spin' : ''}`} />
                  </button>
                </span>

                {deletingId === room.id ? (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Delete room?</span>
                    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setDeletingId(null)}>
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={deleteMutation.isPending}
                      onClick={() => deleteMutation.mutate(room.id)}
                    >
                      Delete
                    </Button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDeletingId(room.id)}
                    className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
              </div>

              {copyFailedId === room.id && (
                <p className="text-[10px] text-amber-600">
                  Couldn't copy automatically — select the code and PIN above by hand.
                  (Copying needs a secure connection; this page is served over plain http.)
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Instructor-only shell. Instructors never mount the game
// (GameProvider) — this page is their whole experience.
export default function InstructorDashboard() {
  const { user, profile, chooseRole, signOut } = useAuth();
  // The whole room, not just its id — the detail page needs the name for
  // export filenames and its session history header.
  const [openRoom, setOpenRoom] = useState(null);

  return (
    <div className="dark min-h-screen text-foreground" style={{ background: INSTRUCTOR_PAGE_BG }}>
      <header
        className="border-b border-border/30"
        style={{ background: 'color-mix(in srgb, var(--primary) 35%, var(--card))' }}
      >
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 text-primary" />
            <div>
              <h1 className="font-display text-lg leading-tight">Instructor Dashboard</h1>
              <p className="text-[10px] text-muted-foreground">{user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {profile?.is_student && (
              <Button variant="outline" size="sm" onClick={() => chooseRole('student')}>
                <GraduationCap className="h-3.5 w-3.5 mr-1" />
                Switch to Student
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="h-3.5 w-3.5 mr-1" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {openRoom ? (
          <ClassroomDetail
            roomId={openRoom.id}
            classroomName={openRoom.name}
            onBack={() => setOpenRoom(null)}
          />
        ) : (
          <RoomList onOpen={setOpenRoom} />
        )}
      </main>
    </div>
  );
}
