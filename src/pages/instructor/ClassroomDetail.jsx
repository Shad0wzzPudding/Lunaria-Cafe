import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import SearchInput from '@/components/ui/SearchInput';
import { ArrowLeft, Mail, UserMinus, Clock, Clock3, Flame, Coins, Star, Users, Trophy, History, Download } from 'lucide-react';
import { INSTRUCTOR_PAGE_INK as PAGE_INK } from '@/lib/theme/themeDeriver';
import Leaderboard from '@/components/leaderboard/Leaderboard';
import InstructorRoundControl from '@/components/liveRound/InstructorRoundControl';
import RoundHistory from '@/components/liveRound/RoundHistory';
import { toCsv, downloadCsv, slugify, fileDateStamp } from '@/lib/export/csv';

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
          {/* Both truncate in a narrow card, so hover reveals the full value. */}
          <p className="font-display text-sm text-foreground truncate" title={student.display_name}>
            {student.display_name}
          </p>
          <p className="text-[10px] text-muted-foreground truncate" title={student.email}>
            {student.email}
          </p>
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

export default function ClassroomDetail({ roomId, classroomName, onBack }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('students'); // 'students' | 'leaderboard' | 'sessions'
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState(null); // { ok, text }
  const [search, setSearch] = useState('');
  const [confirmExport, setConfirmExport] = useState(false);

  const { data: roster, isLoading, error } = useQuery({
    queryKey: ['classroom-roster', roomId],
    queryFn: () => fetchRoster(roomId),
  });

  const filteredRoster = useMemo(() => {
    const list = roster ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((s) =>
      `${s.display_name ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q),
    );
  }, [roster, search]);

  // Exports the roster the instructor is already looking at. Columns are
  // limited to what privacy notice section 5 discloses — deliberately NO
  // email, even though it's on screen: a CSV travels, a screen doesn't.
  const exportRoster = () => {
    const csv = toCsv(
      [
        { key: 'display_name', label: 'Student' },
        { key: (s) => s.stats?.totalFocusSeconds ?? 0, label: 'Total focus seconds' },
        { key: (s) => fmtDuration(s.stats?.totalFocusSeconds), label: 'Total focus time' },
        { key: (s) => s.stats?.totalSessions ?? 0, label: 'Focus sessions' },
        { key: (s) => s.stats?.todaySeconds ?? 0, label: 'Today seconds' },
        { key: (s) => s.stats?.dailyGoal ?? 60, label: 'Daily goal (min)' },
        { key: (s) => s.coins ?? 0, label: 'Coins' },
        { key: (s) => s.reputation ?? 0, label: 'Reputation' },
        { key: (s) => fmtLastActive(s.last_active), label: 'Last active' },
      ],
      // Export what's on screen: a filtered view exports the filtered rows.
      filteredRoster,
    );
    downloadCsv(
      `${slugify(classroomName, 'classroom')}-roster-${fileDateStamp()}.csv`,
      csv,
    );
    setConfirmExport(false);
  };

  // A search narrows what gets written, and the resulting file looks exactly
  // like a full class list — same name, no marker inside. Filing a one-row CSV
  // as the record of a 30-student class is the kind of mistake nobody catches
  // until marking, so a narrowed export has to be agreed to explicitly.
  const handleExportClick = () => {
    if (roster && filteredRoster.length !== roster.length) {
      setConfirmExport(true);
      return;
    }
    exportRoster();
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['classroom-roster', roomId] });
    queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });
    queryClient.invalidateQueries({ queryKey: ['classroom-invites', roomId] });
  };

  // Invitations are now offers, not enrollments: the student sees it on
  // My Classrooms and chooses. The old add_student_by_email put people in
  // a classroom without being asked.
  const inviteMutation = useMutation({
    mutationFn: async (email) => {
      const { error } = await supabase.rpc('invite_student_by_email', {
        _classroom_id: roomId,
        _email: email,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setInviteMsg({ ok: true, text: 'Invitation sent — they join once they accept.' });
      setInviteEmail('');
      refresh();
    },
    onError: (err) => setInviteMsg({ ok: false, text: err.message || 'Could not send the invitation.' }),
  });

  // Outstanding invitations, so an instructor can see who hasn't replied
  // and withdraw one sent to the wrong person.
  const { data: invites } = useQuery({
    queryKey: ['classroom-invites', roomId],
    // Via RPC, not a select with an embedded profiles join: an invited
    // student isn't in classroom_members yet, so profiles RLS hides them
    // from the instructor and the join would come back empty.
    queryFn: async () => {
      const { data, error } = await supabase.rpc('classroom_pending_invites', {
        _classroom_id: roomId,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (inviteId) => {
      const { error } = await supabase.from('classroom_invites').delete().eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: refresh,
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

      <InstructorRoundControl roomId={roomId} />

      <div className="flex gap-1.5">
        {[
          { key: 'students', label: 'Students', icon: Users },
          { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          { key: 'sessions', label: 'Sessions', icon: History },
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
      ) : tab === 'sessions' ? (
        <RoundHistory roomId={roomId} classroomName={classroomName} />
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
          {inviteMutation.isPending ? 'Sending…' : 'Invite'}
        </Button>
      </form>
      {inviteMsg && (
        <p className={`text-xs ${inviteMsg.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{inviteMsg.text}</p>
      )}

      {invites && invites.length > 0 && (
        <div className="rounded-xl border border-border/30 bg-card/60 p-3 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Clock3 className="h-3.5 w-3.5" />
            Awaiting reply ({invites.length})
          </p>
          {invites.map((inv) => (
            <div key={inv.invite_id} className="flex items-center justify-between gap-3">
              {/* Name and email share one truncated line, so the tooltip
                  carries both — hovering either half shows the whole thing. */}
              <span
                className="min-w-0 truncate text-xs text-muted-foreground"
                title={`${inv.display_name} · ${inv.email}`}
              >
                {inv.display_name}
                <span className="text-muted-foreground/50"> · {inv.email}</span>
              </span>
              <button
                type="button"
                onClick={() => withdrawMutation.mutate(inv.invite_id)}
                disabled={withdrawMutation.isPending}
                className="shrink-0 text-[10px] text-muted-foreground/60 transition-colors hover:text-destructive"
              >
                Withdraw
              </button>
            </div>
          ))}
        </div>
      )}

      {isLoading && <p className={`text-sm ${PAGE_INK} text-center py-10`}>Loading students…</p>}
      {error && <p className="text-sm text-amber-700 text-center py-10">Could not load students: {error.message}</p>}

      {roster && roster.length === 0 && (
        <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
          No students yet. Share the room PIN, or add them by email above.
        </div>
      )}

      {roster && roster.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setConfirmExport(false); // the count it warned about just changed
              }}
              placeholder="Search students by name or email…"
              className="min-w-48 flex-1"
            />
            {confirmExport ? (
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-amber-700">
                  Only {filteredRoster.length} matching{' '}
                  {filteredRoster.length === 1 ? 'student' : 'students'} will be exported,
                  not all {roster.length}.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setConfirmExport(false)}
                >
                  Cancel
                </Button>
                <Button size="sm" className="h-8 text-xs" onClick={exportRoster}>
                  Export anyway
                </Button>
              </span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 text-xs"
                // The search/export row stays visible even when a search
                // matches nobody, and exporting then writes a file containing
                // only the header — offer nothing rather than an empty record.
                disabled={filteredRoster.length === 0}
                onClick={handleExportClick}
              >
                <Download className="mr-1 h-3.5 w-3.5" />
                Export CSV
              </Button>
            )}
          </div>

          {filteredRoster.length === 0 ? (
            <div className={`rounded-xl border border-dashed border-border/40 p-10 text-center text-sm ${PAGE_INK}`}>
              No students match "{search}".
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRoster.map((student) => (
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
      </>
      )}
    </div>
  );
}
