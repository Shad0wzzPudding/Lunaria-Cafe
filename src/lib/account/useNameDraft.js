import { useState } from 'react';

// Max display-name length, enforced client-side (input maxLength + canSave) and
// mirrored server-side in the update_display_name RPC.
export const MAX_DISPLAY_NAME = 24;

// Shared editing logic for the display-name inputs (Settings + main menu).
// `current` seeds the field and is the baseline for "unchanged"; `onSave` is the
// async writer (returns { error }). Keeping this in one place stops the two UIs
// from drifting apart on validation/trim rules.
export function useNameDraft(current, onSave) {
  const [name, setName] = useState(current);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const [error, setError] = useState('');

  const trimmed = name.trim();
  // Compare the raw input (not trimmed) so adding stray spaces still counts as a
  // change and Save stays pressable — the value is trimmed on save anyway.
  const unchanged = name === current;
  const canSave =
    trimmed.length > 0 && trimmed.length <= MAX_DISPLAY_NAME && !unchanged && status !== 'saving';

  const onChange = (value) => {
    setName(value);
    if (status !== 'idle') setStatus('idle');
  };

  // Resolves to { error } — null on success (or a no-op skip), the error object
  // on failure — so callers can decide whether to close/dismiss.
  const save = async () => {
    if (!canSave) return { error: null };
    setStatus('saving');
    setError('');
    const { error: err } = await onSave(trimmed);
    if (err) {
      setStatus('error');
      setError(err.message || 'Could not save your name.');
      return { error: err };
    }
    setStatus('saved');
    setName(trimmed); // reflect the trimmed value the server actually stored
    return { error: null };
  };

  return { name, onChange, status, error, canSave, save };
}
