import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';
import { Button } from '../components/Button.jsx';
import { ProgressList } from '../components/Basics.jsx';
import { Header } from '../components/Header.jsx';

export function Extracting() {
  const tab = useStore((s) => s.tab);
  const run = useStore((s) => s.run);
  const cancel = useStore((s) => s.cancel);
  return (
    <>
      <Header />
      <main className="p-4" aria-busy="true">
        <h1 className="mb-4 truncate text-lg">{tab?.hostname ?? t('current_tab')}</h1>
        <ProgressList
          stages={run?.stages ?? ['reading', 'analyzing', 'saving']}
          stage={run?.stage ?? 'reading'}
        />
        <Button variant="secondary" className="mt-4" onClick={cancel}>
          {t('cancel')}
        </Button>
      </main>
    </>
  );
}
