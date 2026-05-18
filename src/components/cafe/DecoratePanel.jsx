import { useGame } from '@/lib/gameState.jsx';
import { Button } from '@/components/ui/button';
import { X, Trash2, Leaf, Table2, Archive, Flame, Square } from 'lucide-react';

const PLACEABLE = [
  { type: 'plant', label: 'Plant', icon: Leaf },
  { type: 'table', label: 'Table', icon: Table2 },
  { type: 'shelf', label: 'Shelf', icon: Archive },
  { type: 'fireplace', label: 'Fireplace', icon: Flame },
  { type: 'window', label: 'Window', icon: Square },
];

export default function DecoratePanel() {
  const { state, dispatch } = useGame();
  const { cafe } = state;
  const removeMode = cafe.decorateTool === 'remove';

  if (!cafe.decorateMode) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[min(calc(100vw-2rem),28rem)] -translate-x-1/2 rounded-xl border border-border/50 bg-card/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-display text-sm text-foreground">Decorate cafe</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => dispatch({ type: 'SET_DECORATE_MODE', payload: false })}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground font-body mb-3">
        {removeMode
          ? 'Click furniture on the cafe to remove it.'
          : 'Pick an item, then click the cafe floor to place it.'}
      </p>

      <div className="flex gap-2 mb-3">
        <Button
          type="button"
          size="sm"
          variant={!removeMode ? 'default' : 'secondary'}
          className="flex-1 font-pixel text-xs"
          onClick={() => dispatch({ type: 'SET_DECORATE_TOOL', payload: 'place' })}
        >
          Place
        </Button>
        <Button
          type="button"
          size="sm"
          variant={removeMode ? 'destructive' : 'secondary'}
          className="flex-1 font-pixel text-xs gap-1"
          onClick={() => dispatch({ type: 'SET_DECORATE_TOOL', payload: 'remove' })}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Remove
        </Button>
      </div>

      {!removeMode && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {PLACEABLE.map(({ type, label, icon: Icon }) => {
            const selected = cafe.placeFurnitureType === type;
            return (
              <button
                key={type}
                type="button"
                onClick={() => dispatch({ type: 'SET_PLACE_FURNITURE', payload: type })}
                className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
                  selected
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border/40 bg-secondary/30 text-muted-foreground hover:border-primary/40'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-pixel text-[10px]">{label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
