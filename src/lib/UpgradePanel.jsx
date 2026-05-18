export default function UpgradePanel({ upgrades = [], coins = 0, onPurchase }) {
  return (
    <div className="space-y-3">
      {upgrades.map((upgrade) => {
        const canAfford = coins >= upgrade.cost;
        return (
          <div
            key={upgrade.id}
            className="flex items-center justify-between rounded-lg border border-white/10 p-3"
          >
            <div>
              <p className="font-medium">{upgrade.name}</p>
              <p className="text-sm text-white/60">{upgrade.description}</p>
            </div>
            <button
              type="button"
              disabled={!canAfford}
              onClick={() => onPurchase?.(upgrade.id)}
              className="rounded-md bg-violet-600 px-3 py-1 text-sm disabled:opacity-40"
            >
              {upgrade.cost}c
            </button>
          </div>
        );
      })}
    </div>
  );
}
