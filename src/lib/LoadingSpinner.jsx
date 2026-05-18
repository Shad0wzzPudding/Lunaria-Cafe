export default function LoadingSpinner({ size = 'md' }) {
  const sizeClass = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-10 w-10' : 'h-6 w-6';

  return (
    <div
      className={`animate-spin rounded-full border-2 border-white/20 border-t-violet-400 ${sizeClass}`}
      role="status"
      aria-label="Loading"
    />
  );
}
