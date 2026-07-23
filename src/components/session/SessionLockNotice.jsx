import { Button } from '@/components/ui/button';
import { MonitorSmartphone, Copy, LogIn } from 'lucide-react';

/**
 * Full-screen block shown when this instance does NOT own the session lock.
 *
 * It is not merely cosmetic: App renders this INSTEAD of the game tree, so
 * GameProvider is unmounted and its autosave interval and beforeunload save are
 * gone. That is what actually stops two instances overwriting each other — the
 * message just explains why.
 */

const COPY = {
  conflict: {
    icon: Copy,
    actionIcon: Copy,
    title: 'Already open in another tab',
    body:
      'Lunaria Cafe is already running in another tab. Only one can run at a time, ' +
      'so the two cannot overwrite each other’s coins, reputation and furniture.',
    action: 'Use this tab',
    note:
      'The other tab will stop and show a notice. Browsers don’t let a page close ' +
      'another tab, so it stays open — you can close it yourself.',
  },
  'taken-over': {
    icon: Copy,
    actionIcon: Copy,
    title: 'Taken over in another tab',
    body:
      'You opened Lunaria Cafe in another tab, so this one stopped to keep your ' +
      'save from being overwritten.',
    action: 'Use this tab instead',
    note: 'You can close this tab, or take control back here.',
  },
  displaced: {
    icon: MonitorSmartphone,
    actionIcon: LogIn,
    title: 'Signed in on another device',
    body:
      'Your account was opened on another device, so this one stopped. Only one ' +
      'device can play at a time, or the two saves would overwrite each other.',
    action: 'Log back in here',
    note: 'Logging back in here will sign the other device out.',
  },
};

export default function SessionLockNotice({ status, onAction, busy = false }) {
  const copy = COPY[status];
  if (!copy) return null;
  // Read the icons from COPY rather than re-deriving from status, so the map is
  // the single source — editing an entry there used to have no effect at all.
  const Icon = copy.icon;
  const ActionIcon = copy.actionIcon;

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/40 bg-card/70 p-7 text-center space-y-5 backdrop-blur-sm">
        <div className="flex justify-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10">
            <Icon className="h-6 w-6 text-amber-400" />
          </span>
        </div>

        <div className="space-y-2">
          <h1 className="font-pixel text-sm text-foreground">{copy.title}</h1>
          <p className="font-body text-xs leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>

        {/* Busy while the other tab flushes its save before releasing — the
            wait is a save round-trip, so it must not look like a dead button. */}
        <Button onClick={onAction} disabled={busy} className="w-full gap-2 font-pixel text-xs">
          {!busy && <ActionIcon className="h-4 w-4" />}
          {busy ? 'Handing over…' : copy.action}
        </Button>

        <p className="font-body text-[10px] leading-relaxed text-muted-foreground/70">
          {copy.note}
        </p>
      </div>
    </div>
  );
}
