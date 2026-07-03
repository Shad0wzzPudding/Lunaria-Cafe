import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { useAuth } from '@/auth/AuthProvider';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, KeyRound, LogOut, GraduationCap } from 'lucide-react';
import { PANEL_BRIGHT_BG } from '@/lib/theme/themeDeriver';

async function fetchClassrooms() {
  const { data, error } = await supabase.rpc('list_classrooms');
  if (error) throw error;
  return data ?? [];
}

function RoomCard({ room, children }) {
  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm text-foreground truncate">{room.name}</p>
          <p className="text-xs text-muted-foreground truncate">by {room.instructor_name}</p>
        </div>
        <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Users className="w-3.5 h-3.5" />
          {room.member_count}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function MyClassrooms() {
  const { dispatch } = useGame();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [joiningId, setJoiningId] = useState(null);
  const [pin, setPin] = useState('');
  const [joinError, setJoinError] = useState('');
  const [leavingId, setLeavingId] = useState(null);

  const { data: rooms, isLoading, error } = useQuery({
    queryKey: ['classrooms'],
    queryFn: fetchClassrooms,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['classrooms'] });

  const joinMutation = useMutation({
    mutationFn: async ({ classroomId, pin }) => {
      const { error } = await supabase.rpc('join_classroom', {
        _classroom_id: classroomId,
        _pin: pin,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setJoiningId(null);
      setPin('');
      setJoinError('');
      refresh();
    },
    onError: (err) => setJoinError(err.message || 'Could not join.'),
  });

  const leaveMutation = useMutation({
    mutationFn: async (classroomId) => {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('classroom_id', classroomId)
        .eq('student_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setLeavingId(null);
      refresh();
    },
  });

  const enrolled = (rooms ?? []).filter((r) => r.is_member);
  const available = (rooms ?? []).filter((r) => !r.is_member);

  const startJoin = (roomId) => {
    setJoiningId(roomId);
    setPin('');
    setJoinError('');
  };

  return (
    <div className="min-h-screen bg-background">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-border/30"
        style={{ background: PANEL_BRIGHT_BG }}
      >
        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch({ type: 'SET_PHASE', payload: 'menu' })}
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="font-display text-lg text-foreground">My Classrooms</h1>
      </header>

      <main className="max-w-lg mx-auto p-6 space-y-8">
        {isLoading && (
          <p className="text-sm text-muted-foreground text-center py-10">Loading classrooms…</p>
        )}
        {error && (
          <p className="text-sm text-amber-400 text-center py-10">
            Could not load classrooms: {error.message}
          </p>
        )}

        {!isLoading && !error && (
          <>
            <section className="space-y-4">
              <h2 className="font-display text-base text-foreground flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-primary" /> Enrolled
              </h2>
              {enrolled.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  You're not in any classroom yet — join one below, or ask your instructor to invite you by email.
                </p>
              ) : (
                enrolled.map((room) => (
                  <RoomCard key={room.id} room={room}>
                    {leavingId === room.id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground flex-1">Leave this classroom?</span>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setLeavingId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={leaveMutation.isPending}
                          onClick={() => leaveMutation.mutate(room.id)}
                        >
                          Leave
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLeavingId(room.id)}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        <LogOut className="w-3 h-3" />
                        Leave
                      </button>
                    )}
                  </RoomCard>
                ))
              )}
            </section>

            <section className="space-y-4">
              <h2 className="font-display text-base text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-primary" /> Available rooms
              </h2>
              {available.length === 0 ? (
                <p className="text-xs text-muted-foreground">No other classrooms right now.</p>
              ) : (
                available.map((room) => (
                  <RoomCard key={room.id} room={room}>
                    {joiningId === room.id ? (
                      <form
                        className="space-y-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          joinMutation.mutate({ classroomId: room.id, pin: pin.trim() });
                        }}
                      >
                        <div className="flex gap-2">
                          <input
                            type="text"
                            inputMode="numeric"
                            placeholder="6-digit PIN"
                            value={pin}
                            onChange={(e) => setPin(e.target.value)}
                            maxLength={6}
                            className="flex-1 rounded-md border border-border/40 bg-background px-3 py-1.5 text-sm tracking-widest"
                            autoFocus
                            required
                          />
                          <Button type="submit" size="sm" className="h-8 text-xs" disabled={joinMutation.isPending}>
                            {joinMutation.isPending ? 'Joining…' : 'Join'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={() => setJoiningId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                        {joinError && <p className="text-xs text-amber-400">{joinError}</p>}
                      </form>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => startJoin(room.id)}
                      >
                        <KeyRound className="w-3 h-3 mr-1" />
                        Join with PIN
                      </Button>
                    )}
                  </RoomCard>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
