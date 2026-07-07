import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Mail, UserMinus, Clock, Flame, Coins, Star, Users, Trophy } from 'lucide-react';
import { INSTRUCTOR_PAGE_INK as PAGE_INK } from '@/lib/theme/themeDeriver';
import Leaderboard from '@/components/leaderboard/Leaderboard';

async function fetchRoster(roomId) {
  const { data, error } = await supabase.rpc('get_classroom_stats', { _classroom_id: roomId });
  if (error) throw error;
  return data ?? [];
}

function fmtDuration(seconds) {
  const s = Number(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtLastActive(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'never';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function StatChip({ icon: Icon, label, value }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground" title={label}>
      <Icon className="h-3.5 w-3.5" />
      <span className="text-foreground/90">{value}</span>
    </span>
  );
}

function StudentRow({ student, onRemove, removePending }) {
  const [confirming, setConfirming] = useState(false);
  const stats = student.stats;

  return (
    <div className="rounded-xl border border-border/30 bg-card/60 p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-sm text-foreground truncate">{student.display_name}</p>
          <p className="text-[10px] text-muted-foreground truncate">{student.email}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground">
            last active: {fmtLastActive(student.last_active)}
          </span>
          {confirming ? (
            <>
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                disabled={removePending}
                onClick={() => onRemove(student.student_id)}
              >
                Remove
              </Button>
            </>
          ) : (
            <button
              type="button"
              title="Remove from classroom"
              onClick={() => setConfirming(true)}
              className="text-muted-foreground/60 hover:text-destructive transition-colors"
            >
              <UserMinus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {stats ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <StatChip icon={Clock} label="Total focus time" value={fmtDuration(stats.totalFocusSeconds)} />
          <StatChip icon={Flame} label="Focus sessions" value={`${stats.totalSessions ?? 0} sessions`} />
          <StatChip
            icon={Clock}
            label="Today vs daily goal"
            value={`today ${fmtDuration(stats.todaySeconds)} / goal ${stats.dailyGoal ?? 60}m`}
          />
          <StatChip icon={Coins} label="Coins" value={student.coins ?? 0} />
          <StatChip icon={Star} label="Reputation" value={student.reputation ?? 0} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground/60">No save data yet — they haven't played.</p>
      )}
    </div>
  );
}

export default function ClassroomDetail({ roomId, onBack }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('students'); // 'students' | 'leaderboard'
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null); // { ok, text }

  const { data: roster, isLoading, error } = useQuery({
    queryKey: ['classroom-roster', roomId],
    queryFn: () => fetchRoster(roomId),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom-roster', roomId] });
    queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });
  };

  const inviteMutation = useMutation({
    mutationFn: async (email) => {
      const { error } = await supabase.rpc('add_student_by_email', {
        _classroom_id: roomId,
        _email: email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setInviteMsg({ ok: true, text: 'Student added!' });
      setInviteEmail('');
      refresh();
    },
    onError: (err) => setInviteMsg({ ok: false, text: err.message || 'Could not add student.' }),
  });

  const removeMutation = useMutation({
    mutationFn: async (studentId) => {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('classroom_id', roomId)
        .eq('student_id', studentId);
      if (error) throw error;
    },
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className={`flex items-center gap-1.5 text-xs ${PAGE_INK} hover:text-[#221c33] transition-colors`}
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All classrooms
      </button>

      <div className="flex gap-1.5">
        {[
          { key: 'students', label: 'Students', icon: Users },
          { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === key
                ? 'bg-primary text-primary-foreground'
                : 'bg-card/60 text-muted-foreground hover:text-foreground border border-border/40'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'leaderboard' ? (
        <Leaderboard roomId={roomId} />
      ) : (
      <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const email = inviteEmail.trim();
          if (email) {
            setInviteMsg(null);
            inviteMutation.mutate(email);
          }
        }}
      >
        <input
          type="email"
          placeholder="Invite student by email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="flex-1 rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          style={{ fontFamily: "'Inter Variable', sans-serif" }}
          required
        />
        <Button type="submit" disabled={inviteMutation.isPending}>
          <Mail className="h-4 w-4 mr-1" />
          {inviteMutation.isPending ? 'Adding…' : 'Add'}
        </Button>
      </form>
      {inviteMsg && (
        <p className={`text-xs ${inviteMsg.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{inviteMsg.text}</p>
      )}

      {isLoading && <p className={`text-sm ${PAGE_INK} text-center py-10`}>Loading students…</p>}
      {error && <p className="text-sm text-amber-700 text-center py-10">Could not load students: {error.message}</p>}

      {roster && roster.length === 0 && (
        <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
          No students yet. Share the room PIN, or add them by email above.
        </div>
      )}

      {roster && roster.length > 0 && (
        <div className="space-y-3">
          {roster.map((student) => (
            <StudentRow
              key={student.student_id}
              student={student}
              onRemove={(id) => removeMutation.mutate(id)}
              removePending={removeMutation.isPending}
            />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
