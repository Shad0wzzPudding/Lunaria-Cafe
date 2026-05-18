import { useState } from 'react';

export default function SoundToggle({ defaultEnabled = true, onChange }) {
  const [enabled, setEnabled] = useState(defaultEnabled);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-lg border border-white/10 px-3 py-2 text-sm"
      aria-pressed={enabled}
    >
      Sound: {enabled ? 'On' : 'Off'}
    </button>
  );
}
