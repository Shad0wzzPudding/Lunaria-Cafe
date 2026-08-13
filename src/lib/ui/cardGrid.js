/**
 * Card-grid definitions, shared by the student and instructor room lists so
 * both sides lay out the same way.
 *
 * auto-fill + minmax rather than sm:/lg:/xl: breakpoints: the column count
 * follows the CONTAINER's real width, not the viewport's. That matters because
 * the same grid renders both on a full-width page and inside the narrower
 * "Join a classroom" dialog — viewport breakpoints would give the dialog three
 * cramped columns on a wide screen.
 *
 * ⚠ These must stay LITERAL strings. Tailwind generates arbitrary-value classes
 * by scanning source text, so a class assembled from a template variable is
 * never emitted and the grid silently collapses to one column. Verified present
 * in the built CSS; if you parameterise these, check dist/assets/*.css again.
 */

/** Student room cards — name, instructor, member count. */
export const ROOM_GRID = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]';

/**
 * Instructor room cards, which carry a denser second row (class code + copy
 * button + PIN + regenerate + delete). Below roughly this width that row wraps
 * into an unreadable stack, so they get a wider minimum than student cards.
 */
export const ROOM_GRID_WIDE = 'grid gap-3 grid-cols-[repeat(auto-fill,minmax(22rem,1fr))]';
