export default function NotificationToast({ message, type = 'info', onDismiss }) {
  const styles = {
    info: 'border-violet-500/40 bg-violet-500/10',
    success: 'border-emerald-500/40 bg-emerald-500/10',
    warning: 'border-amber-500/40 bg-amber-500/10',
    error: 'border-rose-500/40 bg-rose-500/10',
  };

  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-lg border px-4 py-3 ${styles[type]}`}
      role="alert"
    >
      <p className="text-sm">{message}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-xs text-white/60 hover:text-white">
          Dismiss
        </button>
      )}
    </div>
  );
}
