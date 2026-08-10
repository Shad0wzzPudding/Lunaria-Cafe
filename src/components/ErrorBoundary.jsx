import { Component } from 'react';

/**
 * Catches a render crash so it never reaches the browser's white screen.
 *
 * A class component because getDerivedStateFromError / componentDidCatch have
 * no hook equivalent — this is the one place React still requires one.
 *
 * Two are mounted (see App.jsx), and the difference matters:
 *   - the OUTER one is the last line of defence; it can only offer a reload
 *   - the INNER one wraps the cafe, so a crash in there can drop the player
 *     back to the menu with the rest of the app — and their save — intact
 *
 * `onReset` is what makes the inner one worth having. Without it the boundary
 * would hold the broken tree forever, since React does not retry on its own.
 */
export default class ErrorBoundary extends Component {
  // `hasError` is tracked separately from the error VALUE on purpose. Keying
  // the fallback off the value means `throw null` (or any throw of something
  // that turned out undefined) stores a falsy error, render decides there is no
  // error, the children mount and throw again — a loop, inside the one
  // component whose whole job is to stop exactly that.
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Keep the console trail — the recovery screen deliberately shows only a
    // short message, and a stack is what makes a bug report useful.
    console.error('[boundary] render crash:', error, info?.componentStack);
  }

  handleReset = () => {
    // Clear the error FIRST so the children remount; if onReset throws we are
    // no worse off than before, still on a recoverable screen.
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render() {
    const { hasError, error } = this.state;
    if (!hasError) return this.props.children;

    const { title, message, resetLabel } = this.props;

    return (
      // fixed + z-[250] + an explicit `visibility`, because of where the inner
      // boundary sits: the cafe wrapper carries `visibility: hidden` for the
      // ~2.5s loading phase, and visibility INHERITS, so a fallback rendered
      // in there was invisible exactly when a mount-time crash is most likely.
      // An explicit value overrides the inherited one, and the z-index clears
      // the loading screen's z-50. The outer boundary looks the same as before.
      <div
        className="dark fixed inset-0 z-[250] flex items-center justify-center bg-background p-6 overflow-auto"
        style={{ visibility: 'visible' }}
      >
        <div className="w-full max-w-md rounded-xl border border-border/40 bg-card/60 p-6 text-center space-y-4">
          <p className="text-4xl select-none" aria-hidden="true">🌙</p>
          <h1 className="font-pixel text-sm text-foreground">
            {title ?? 'The cafe hiccuped'}
          </h1>
          <p className="font-body text-sm text-muted-foreground leading-relaxed">
            {message ?? 'Something went wrong while drawing this screen. Your save is untouched.'}
          </p>

          <div className="flex flex-col gap-2 pt-1">
            {this.props.onReset && (
              <button
                type="button"
                onClick={this.handleReset}
                className="rounded-md border border-primary/40 bg-primary/15 px-4 py-2 font-pixel text-xs text-primary hover:bg-primary/25 transition-colors"
              >
                {resetLabel ?? 'Back to the menu'}
              </button>
            )}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md border border-border/40 px-4 py-2 font-pixel text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Reload the page
            </button>
          </div>

          {/* The message itself, for a bug report. Collapsed so the recovery
              screen stays calm, but present so a player can tell you what
              broke without opening devtools. */}
          <details className="text-left">
            <summary className="cursor-pointer font-pixel text-[10px] text-muted-foreground/60 hover:text-muted-foreground">
              Technical details
            </summary>
            <p className="mt-2 break-words font-mono text-[11px] text-muted-foreground/70">
              {/* `?? 'Unknown error'` matters here: a falsy throw is exactly the
                  case hasError exists to survive, and it would otherwise leave
                  this box empty. */}
              {String(error?.message ?? error ?? 'Unknown error')}
            </p>
          </details>
        </div>
      </div>
    );
  }
}
