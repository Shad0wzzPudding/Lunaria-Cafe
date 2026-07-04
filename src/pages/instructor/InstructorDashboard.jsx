import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { BookOpen, GraduationCap, LogOut, Users, KeyRound, RefreshCw, Trash2, Plus, ChevronRight } from 'lucide-react';
import ClassroomDetail from './ClassroomDetail';
import { INSTRUCTOR_PAGE_BG, INSTRUCTOR_PAGE_INK as PAGE_INK } from '@/lib/theme/themeDeriver';

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

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['my-classrooms'],
    queryFn: fetchMyClassrooms,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });

  const createMutation = useMutation({
    mutationFn: async (name) => {
      const { error } = await supabase
        .from('classrooms')
        .insert({ name, instructor_id: user.id });
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
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (name) createMutation.mutate(name);
        }}
      >
        <input
          type="text"
          placeholder="New classroom name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={60}
          className="flex-1 rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          required
        />
        <Button type="submit" disabled={createMutation.isPending}>
          <Plus className="h-4 w-4 mr-1" />
          {createMutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </form>
      {formError && <p className="text-xs text-amber-700">{formError}</p>}

      {rooms.length === 0 ? (
        <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
          No classrooms yet — create your first one above. Students join with the room's PIN, or you invite them by email.
        </div>
      ) : (
        <div className="space-y-3">
          {rooms.map((room) => (
            <div key={room.id} className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onOpen(room.id)}
                  className="flex items-center gap-2 min-w-0 text-left group"
                >
                  <span className="font-display text-sm text-foreground truncate group-hover:text-primary transition-colors">
                    {room.name}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                </button>
                <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Users className="h-3.5 w-3.5" />
                  {room.member_count}
                </span>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
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
  const [openRoomId, setOpenRoomId] = useState(null);

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
        {openRoomId ? (
          <ClassroomDetail roomId={openRoomId} onBack={() => setOpenRoomId(null)} />
        ) : (
          <RoomList onOpen={setOpenRoomId} />
        )}
      </main>
    </div>
  );
}
