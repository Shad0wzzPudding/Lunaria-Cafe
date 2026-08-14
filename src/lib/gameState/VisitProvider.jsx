import { useMemo, useReducer } from 'react';
import { GameContext } from './gameContext';
import { gameReducer } from './gameReducer';
import { initialState } from './initialState';

/**
 * A game context for somebody ELSE's cafe.
 *
 * Supplies the same shape as GameProvider so CafeCanvas — which only wants
 * `{ state, dispatch }` — renders a friend's cafe with no changes at all.
 *
 * The point of it being a separate provider rather than a flag on GameProvider
 * is that **there is no save code in this file**. GameProvider autosaves
 * `stateRef.current` every 30s, again on beforeunload, and again on session-lock
 * handover; seeding a friend's furniture into that state would write their cafe
 * into the visitor's `player_saves` row and destroy their own. Here that cannot
 * happen by construction, not by a guard someone might later move.
 *
 * The reducer is still live, so the pets and staff wander (CafeCanvas dispatches
 * UPDATE_RABBIT / UPDATE_CAT as it animates). Nothing that earns anything runs:
 * the customer arrivals, the serving payouts and the chaos loop all live in
 * CafeView's intervals, which the visit view does not mount.
 */
export function VisitProvider({ snapshot, children }) {
  const seeded = useMemo(() => {
    const cafe = snapshot?.cafe ?? {};
    const npcs = snapshot?.npcs ?? {};
    return {
      ...initialState,
      // Straight to the rendered cafe; no loading screen, no menu.
      phase: 'management',
      cafe: {
        ...initialState.cafe,
        name: cafe.name ?? initialState.cafe.name,
        furniture: Array.isArray(cafe.furniture) ? cafe.furniture : [],
        bgMode: cafe.bgMode ?? initialState.cafe.bgMode,
        timeOfDay: cafe.timeOfDay ?? initialState.cafe.timeOfDay,
        upgrades: Array.isArray(cafe.upgrades) ? cafe.upgrades : [],
        // Forced off regardless of what the snapshot carried: decorateMode is
        // the only thing that makes canvas clicks mutate furniture, and a
        // visitor must not be able to rearrange the room they are standing in.
        decorateMode: false,
        pendingFurniture: null,
        currentCustomers: 0,
      },
      npcs: {
        ...initialState.npcs,
        rabbits: Array.isArray(npcs.rabbits) ? npcs.rabbits : [],
        cats: Array.isArray(npcs.cats) ? npcs.cats : [],
        major: Array.isArray(npcs.major) ? npcs.major : initialState.npcs.major,
        // Never persisted, so there is no crowd to restore — the room reads as
        // between rushes rather than empty.
        customers: [],
      },
      pets: { ...initialState.pets, owned: Array.isArray(snapshot?.pets?.owned) ? snapshot.pets.owned : [] },
    };
  }, [snapshot]);

  const [state, dispatch] = useReducer(gameReducer, seeded);

  // The remaining context fields exist so nothing in the subtree crashes
  // reaching for them. They are inert on purpose — saveNow reports failure
  // rather than pretending, because there is genuinely nothing to save.
  const value = useMemo(
    () => ({
      state,
      dispatch,
      processAIEvent: () => {},
      saveNow: async () => false,
      saveError: null,
      logout: () => {},
    }),
    [state],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export default VisitProvider;
