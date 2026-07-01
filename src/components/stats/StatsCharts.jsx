import React from 'react';
import { useGame } from '@/lib/gameState/GameProvider.jsx';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Clock, Flame, Coins, Users, Sparkles, Rabbit } from 'lucide-react';
import DailyGoalTracker from './DailyGoalTracker.jsx';

function StatCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <div
      className="backdrop-blur-sm rounded-xl border border-border/30 p-4"
      style={{ background: `color-mix(in srgb, ${color} 12%, var(--card))` }}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs text-muted-foreground font-body">{label}</span>
      </div>
      <div className="font-pixel text-xl" style={{ color }}>{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  );
}

function SegmentedToggle({ value, options, onChange }) {
  return (
    <div className="flex rounded-lg border border-border/40 overflow-hidden">
      {options.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`px-4 py-1.5 font-pixel text-[10px] transition-colors ${
            value === key
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function StatsCharts() {
  const { state, dispatch } = useGame();
  const { stats } = state;
  const resetPeriod = stats.resetPeriod ?? 'daily';
  const statsMode   = stats.statsMode   ?? 'period';

  function formatTotal(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    if (s > 0 || parts.length === 0) parts.push(`${s}s`);
    return parts.join(' ');
  }

  const isPeriod = statsMode === 'period';
  const displaySessions  = isPeriod ? (stats.periodSessions       ?? 0) : (stats.totalSessions  ?? 0);
  const displayFocus     = isPeriod ? (stats.periodFocusSeconds   ?? 0) : (stats.totalFocusSeconds ?? 0);
  const displayCoins     = isPeriod ? (stats.periodCoinsEarned    ?? 0) : (stats.coinsEarned    ?? 0);
  const displayCustomers = isPeriod ? (stats.periodCustomersTotal ?? 0) : (stats.customersTotal  ?? 0);
  const displayChaos     = isPeriod ? (stats.periodChaosEvents    ?? 0) : (stats.chaosEvents     ?? 0);

  const periodLabel = resetPeriod === 'weekly' ? 'This Week' : 'Today';

  const debugDate  = state.ui?.debugDate ?? null;
  const activeDate = debugDate ?? new Date().toISOString().split('T')[0];
  const displayDate = new Date(activeDate + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyChartData = stats.weeklyData.map((seconds, i) => ({
    day: weekDays[i],
    seconds,
  }));

  return (
    <div className="space-y-6">
      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <span className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">Goal resets</span>
          <SegmentedToggle
            value={resetPeriod}
            options={[{ key: 'daily', label: 'Every Day' }, { key: 'weekly', label: 'Every Week' }]}
            onChange={v => dispatch({ type: 'SET_RESET_PERIOD', payload: v })}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="font-pixel text-[10px] text-muted-foreground uppercase tracking-widest shrink-0">Stats show</span>
          <SegmentedToggle
            value={statsMode}
            options={[{ key: 'period', label: periodLabel }, { key: 'lifetime', label: 'Lifetime' }]}
            onChange={v => dispatch({ type: 'SET_STATS_MODE', payload: v })}
          />
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Clock}    label="Sessions"         value={displaySessions}          color="#cc7ada" />
        <StatCard icon={Flame}    label="Focus Time"       value={formatTotal(displayFocus)} color="#e8a040" />
        <StatCard icon={Coins}    label="Coins Earned"     value={displayCoins}              color="#f0c674" />
        <StatCard icon={Users}    label="Customers Served" value={displayCustomers}           color="#7ec8a0" />
        <StatCard icon={Sparkles} label="Current Streak"   value={`${stats.currentStreak}d`} color="#6b9fdb" />
        <StatCard icon={Rabbit}   label="Chaos Events"     value={displayChaos}              color="#d4a0b0" />
      </div>

      {/* Daily goal */}
      <DailyGoalTracker current={stats.todaySeconds} goal={stats.dailyGoal * 60} />

      {/* Weekly chart */}
      <div
        className="backdrop-blur-sm rounded-xl border border-border/30 p-4"
        style={{ background: 'color-mix(in srgb, var(--primary) 10%, var(--card))' }}
      >
        <div className="flex items-baseline justify-between mb-4">
          <h3 className="font-display text-sm text-foreground/80">Weekly Focus</h3>
          <span className="font-pixel text-[10px] text-muted-foreground">
            {displayDate}{debugDate && <span className="text-amber-400 ml-1">(simulated)</span>}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyChartData}>
            <XAxis dataKey="day" tick={{ fill: 'hsl(232 15% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: 'hsl(232 30% 12%)', border: '1px solid hsl(232 25% 20%)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'hsl(45 20% 90%)' }}
              formatter={(v) => [formatTotal(v), 'Focus']}
            />
            <Bar dataKey="seconds" fill="var(--primary)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
