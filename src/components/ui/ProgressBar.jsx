function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  className = '',
  labelClassName = 'text-white/70',
  trackClassName = 'bg-white/10',
  fillClassName = 'bg-violet-500',
  heightClassName = 'h-2',
}) {
  const safeValue = Number.isFinite(Number(value)) ? Number(value) : 0;
  const safeMax = Number.isFinite(Number(max)) ? Number(max) : 0;
  const percent = safeMax > 0 ? Math.min(100, Math.max(0, (safeValue / safeMax) * 100)) : 0;

  return (
    <div className={cx('w-full', className)}>
      {label && (
        <div className={cx('mb-1 flex justify-between text-xs', labelClassName)}>
          <span>{label}</span>
          <span>{Math.round(percent)}%</span>
        </div>
      )}

      <div
        className={cx('overflow-hidden rounded-full', heightClassName, trackClassName)}
        role="progressbar"
        aria-label={label || 'Progress'}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(percent)}
      >
        <div
          className={cx('h-full rounded-full transition-all', fillClassName)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}