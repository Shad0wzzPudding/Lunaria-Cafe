export default function CurrencyDisplay({ coins = 0, reputation = 0 }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-300">
        {coins} coins
      </span>
      <span className="rounded-full bg-rose-500/20 px-3 py-1 text-rose-300">
        {reputation} rep
      </span>
    </div>
  );
}
