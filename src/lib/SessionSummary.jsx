export default function SessionSummary({ durationMinutes, coinsEarned, reputationGain }) {
  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-6 text-center">
      <h2 className="text-lg font-semibold text-white">Session Complete</h2>
      <p className="mt-2 text-white/70">You focused for {durationMinutes} minutes.</p>
      <div className="mt-4 flex justify-center gap-6 text-sm">
        <span className="text-amber-300">+{coinsEarned} coins</span>
        <span className="text-rose-300">+{reputationGain} rep</span>
      </div>
    </div>
  );
}
