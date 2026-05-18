export default function InventorySlot({ item, quantity = 0, empty = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex aspect-square flex-col items-center justify-center rounded-lg border border-dashed border-white/20 bg-white/5 p-2 text-center"
    >
      {empty ? (
        <span className="text-xs text-white/30">Empty</span>
      ) : (
        <>
          <span className="text-lg">{item?.icon ?? '📦'}</span>
          <span className="mt-1 truncate text-xs">{item?.name}</span>
          <span className="text-[10px] text-white/50">x{quantity}</span>
        </>
      )}
    </button>
  );
}
