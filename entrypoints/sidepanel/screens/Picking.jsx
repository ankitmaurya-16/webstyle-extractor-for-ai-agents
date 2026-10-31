import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';
import { Button } from '../components/Button.jsx';
import { Header } from '../components/Header.jsx';

/** Element picker instructions (F26). The page handles Esc, arrows and Enter; these buttons send the same keys. */
export function Picking() {
  const picking = useStore((s) => s.picking);
  const { cancelPick, pickKey } = useStore.getState();
  return (
    <>
      <Header onBack={cancelPick} title={t('picking_title')} />
      <main className="p-4">
        <p className="text-text">{t('picking_body')}</p>
        <p className="mt-1 text-sm text-faint">{t('picking_keys')}</p>
        <p
          className="mt-4 min-h-5 font-mono text-sm text-muted"
          aria-live="polite"
          data-testid="pick-current"
        >
          {picking?.tag
            ? t(
                'picking_current',
                picking.tag,
                Math.round(picking.width),
                Math.round(picking.height),
              )
            : ''}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" className="h-7" onClick={() => pickKey('ArrowUp')}>
            <ArrowUp size={14} aria-hidden />
            {t('parent')}
          </Button>
          <Button variant="secondary" className="h-7" onClick={() => pickKey('ArrowDown')}>
            <ArrowDown size={14} aria-hidden />
            {t('child')}
          </Button>
          <Button
            variant="primary"
            className="h-7"
            disabled={!picking?.tag}
            onClick={() => pickKey('Enter')}
          >
            <Check size={14} aria-hidden />
            {t('select_element')}
          </Button>
          <Button variant="ghost" className="h-7" onClick={cancelPick}>
            {t('cancel')}
          </Button>
        </div>
      </main>
    </>
  );
}
