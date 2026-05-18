export default function MenuItemCard({ name, price, description, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:bg-white/10"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-white">{name}</h3>
        <span className="text-amber-300">{price}c</span>
      </div>
      {description && (
        <p className="mt-2 text-sm text-white/60">{description}</p>
      )}
    </button>
  );
}
