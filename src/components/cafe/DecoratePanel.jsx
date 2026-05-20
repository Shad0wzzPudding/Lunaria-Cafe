import { useGame } from '@/lib/gameState.jsx';
import { Button } from '@/components/ui/button';
import { X, Trash2 } from 'lucide-react';
import { FURNITURE_CATALOG } from '@/components/cafe/CafeCanvas';

const PLACEABLE = [
  { type: 'baner',              label: 'Banner' },
  { type: 'bar_counter1',       label: 'Bar Counter' },
  { type: 'bar_counter2',       label: 'Bar Counter 2' },
  { type: 'barrel',             label: 'Barrel' },
  { type: 'bench',              label: 'Bench' },
  { type: 'bookcase_small',     label: 'Bookcase' },
  { type: 'cabinet',            label: 'Cabinet' },
  { type: 'candle',             label: 'Candle' },
  { type: 'chair',              label: 'Chair' },
  { type: 'chair2',             label: 'Chair 2' },
  { type: 'chair_blue',         label: 'Chair Blue' },
  { type: 'chair_red',          label: 'Chair Red' },
  { type: 'crate',              label: 'Crate' },
  { type: 'dresser',            label: 'Dresser' },
  { type: 'fireplace',          label: 'Fireplace' },
  { type: 'lantern',            label: 'Lantern' },
  { type: 'long_table',         label: 'Long Table' },
  { type: 'nightstand',         label: 'Nightstand' },
  { type: 'painting',           label: 'Painting' },
  { type: 'plant_big',          label: 'Plant Big' },
  { type: 'plant_blue',         label: 'Plant Blue' },
  { type: 'plant_small',        label: 'Plant Small' },
  { type: 'red_carpet',         label: 'Red Carpet' },
  { type: 'sofa_blue',          label: 'Sofa Blue' },
  { type: 'sofa_red',           label: 'Sofa Red' },
  { type: 'table_long',         label: 'Table Long' },
  { type: 'table_round',        label: 'Table Round' },
  { type: 'table_square',       label: 'Table' },
  { type: 'table_square_plant', label: 'Table+Plant' },
  { type: 'wardrobe',           label: 'Wardrobe' },
];

export default function DecoratePanel() {
  const { state, dispatch } = useGame();
  const { cafe } = state;
  const removeMode = cafe.decorateTool === 'remove';

  if (!cafe.decorateMode) return null;

  return (
    <div className="fixed bottom-24 left-1/2 z-40 w-[min(calc(100vw-2rem),34rem)] -translate-x-1/2 rounded-xl border border-border/50 bg-card/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="font-display text-sm text-foreground">Decorate Cafe</h3>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7"
          onClick={() => dispatch({ type: 'SET_DECORATE_MODE', payload: false })}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground font-body mb-3">
        {removeMode ? 'Click furniture on the cafe to remove it.' : 'Pick an item, then click the cafe floor to place it.'}
      </p>

      <div className="flex gap-2 mb-3">
        <Button type="button" size="sm" variant={!removeMode ? 'default' : 'secondary'}
          className="flex-1 font-pixel text-xs"
          onClick={() => dispatch({ type: 'SET_DECORATE_TOOL', payload: 'place' })}>
          Place
        </Button>
        <Button type="button" size="sm" variant={removeMode ? 'destructive' : 'secondary'}
          className="flex-1 font-pixel text-xs gap-1"
          onClick={() => dispatch({ type: 'SET_DECORATE_TOOL', payload: 'remove' })}>
          <Trash2 className="w-3.5 h-3.5" /> Remove
        </Button>
      </div>

      {!removeMode && (
        <div className="max-h-56 overflow-y-auto pr-1">
          <div className="grid grid-cols-5 gap-2">
            {PLACEABLE.map(({ type, label }) => {
              const selected = cafe.placeFurnitureType === type;
              const info = FURNITURE_CATALOG[type];
              return (
                <button key={type} type="button"
                  onClick={() => dispatch({ type: 'SET_PLACE_FURNITURE', payload: type })}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors ${
                    selected ? 'border-primary bg-primary/15' : 'border-border/40 bg-secondary/30 hover:border-primary/40'
                  }`}>
                  <div className="w-10 h-10 flex items-center justify-center">
                    {info && (
                      <img src={`/assets/decoration/${info.file}`} alt={label}
                        className="max-w-full max-h-full object-contain"
                        style={{ imageRendering: 'pixelated' }} />
                    )}
                  </div>
                  <span className={`font-pixel text-[9px] text-center leading-tight ${selected ? 'text-primary' : 'text-muted-foreground'}`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}