import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';

/** A color swatch button that copies its hex (AC-F2.9). */
export function Swatch({ hex, size = 20 }) {
  const copy = useStore((s) => s.copy);
  return (
    <button
      type="button"
      onClick={() => copy(hex)}
      aria-label={t('copy_hex', hex)}
      title={t('copy_hex', hex)}
      className={`relative shrink-0 rounded-swatch ${hex.length > 7 ? 'checker overflow-hidden' : ''}`}
      style={{ width: size, height: size, ...(hex.length > 7 ? {} : { background: hex }) }}
    >
      {hex.length > 7 && <span className="absolute inset-0" style={{ background: hex }} />}
      <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
    </button>
  );
}
