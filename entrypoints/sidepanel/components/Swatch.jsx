import { useStore } from '../store.js';
import { S } from '../strings.js';

/** A color swatch button that copies its hex (AC-F2.9). */
export function Swatch({ hex, size = 20 }) {
  const copy = useStore((s) => s.copy);
  return (
    <button
      type="button"
      onClick={() => copy(hex)}
      aria-label={S.copyHex(hex)}
      title={S.copyHex(hex)}
      className="relative shrink-0 rounded-swatch"
      style={{ width: size, height: size, background: hex }}
    >
      <span className="pointer-events-none absolute inset-0 rounded-swatch ring-1 ring-swatch-ring ring-inset" />
    </button>
  );
}
