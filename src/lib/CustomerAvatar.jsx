export default function CustomerAvatar({ name, mood = 'happy', size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-12 w-12 text-sm';
  const moodEmoji = { happy: '😊', neutral: '😐', impatient: '😤' }[mood] ?? '🙂';

  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex items-center justify-center rounded-full bg-violet-500/30 ${sizeClass}`}
        aria-hidden="true"
      >
        {moodEmoji}
      </div>
      {name && <span className="text-xs text-white/70">{name}</span>}
    </div>
  );
}
