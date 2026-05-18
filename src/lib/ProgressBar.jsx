export default function ProgressBar({ value = 0, max = 100, label }) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;

  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex justify-between text-xs text-white/70">
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-violet-500 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
