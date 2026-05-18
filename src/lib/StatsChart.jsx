export default function StatsChart({ data = [], labelKey = 'label', valueKey = 'value' }) {
  const maxValue = Math.max(...data.map((item) => item[valueKey]), 1);

  return (
    <div className="space-y-2">
      {data.map((item) => (
        <div key={item[labelKey]} className="space-y-1">
          <div className="flex justify-between text-xs text-white/70">
            <span>{item[labelKey]}</span>
            <span>{item[valueKey]}</span>
          </div>
          <div className="h-2 rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-rose-400"
              style={{ width: `${(item[valueKey] / maxValue) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
