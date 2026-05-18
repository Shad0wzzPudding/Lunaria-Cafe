export default function AchievementBadge({ title, unlocked = false, icon = '★' }) {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg p-3 ${
        unlocked ? 'bg-amber-500/20 text-amber-200' : 'bg-white/5 text-white/40'
      }`}
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-center text-xs">{title}</span>
    </div>
  );
}
