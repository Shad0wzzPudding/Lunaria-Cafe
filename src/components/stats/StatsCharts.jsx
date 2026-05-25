import React from 'react';
import { useGame } from '@/lib/gameState.jsx';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Clock, Flame, Coins, Users, Sparkles, Rabbit } from 'lucide-react';

function StatCard({ icon: Icon, label, value, color, subtext }) {
  return (
    <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4" style={{ color }} />
        <span className="text-xs text-muted-foreground font-body">{label}</span>
      </div>
      <div className="font-pixel text-xl" style={{ color }}>{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  );
}

export default function StatsCharts() {
  const { state } = useGame();
  const { stats } = state;
  
  function formatTotal(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weeklyChartData = stats.weeklyData.map((mins, i) => ({
    day: weekDays[i],
    minutes: mins,
  }));
  
  const goalProgress = Math.min(100, Math.round((stats.todayMinutes / stats.dailyGoal) * 100));
  
  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard icon={Clock} label="Total Sessions" value={stats.totalSessions} color="#cc7ada" />
        <StatCard icon={Flame} label="Focus Time" value={formatTotal(stats.totalFocusSeconds)} color="#e8a040" />
        <StatCard icon={Coins} label="Coins Earned" value={stats.coinsEarned} color="#f0c674" />
        <StatCard icon={Users} label="Customers Served" value={stats.customersTotal} color="#7ec8a0" />
        <StatCard icon={Sparkles} label="Current Streak" value={`${stats.currentStreak}d`} color="#6b9fdb" />
        <StatCard icon={Rabbit} label="Chaos Events" value={stats.chaosEvents} color="#d4a0b0" />
      </div>
      
      {/* Daily goal */}
      <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted-foreground font-body">Today's Goal</span>
          <span className="font-pixel text-sm text-primary">{stats.todayMinutes}/{stats.dailyGoal} min</span>
        </div>
        <div className="h-3 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all duration-500"
            style={{ width: `${goalProgress}%` }}
          />
        </div>
        <div className="text-right mt-1 text-xs text-muted-foreground">{goalProgress}%</div>
      </div>
      
      {/* Weekly chart */}
      <div className="bg-card/60 backdrop-blur-sm rounded-xl border border-border/30 p-4">
        <h3 className="font-display text-sm text-foreground/80 mb-4">Weekly Focus</h3>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weeklyChartData}>
            <XAxis dataKey="day" tick={{ fill: 'hsl(232 15% 55%)', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip
              contentStyle={{ background: 'hsl(232 30% 12%)', border: '1px solid hsl(232 25% 20%)', borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: 'hsl(45 20% 90%)' }}
              formatter={(v) => [`${v} min`, 'Focus']}
            />
            <Bar dataKey="minutes" fill="hsl(265 45% 55%)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}