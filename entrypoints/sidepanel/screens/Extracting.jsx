import { useStore } from '../store.js';
import { S } from '../strings.js';
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
        <h1 className="mb-4 truncate text-lg">{tab?.hostname ?? S.currentTab}</h1>
        <ProgressList stage={run?.stage ?? 'reading'} />
        <Button variant="secondary" className="mt-4" onClick={cancel}>
          {S.cancel}
        </Button>
      </main>
    </>
  );
}
