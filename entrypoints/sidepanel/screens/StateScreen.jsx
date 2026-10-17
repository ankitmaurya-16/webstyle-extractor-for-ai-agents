import { AlertTriangle, Copy, Lock, RotateCcw } from 'lucide-react';
import { useStore } from '../store.js';
import { S } from '../strings.js';
import { Button, Keycap } from '../components/Button.jsx';
import { StateBlock } from '../components/Basics.jsx';
import { Header } from '../components/Header.jsx';

const KIND = {
  RESTRICTED_PAGE: 'restricted',
  FILE_ACCESS: 'restricted',
  NO_ACCESS: 'noAccess',
  EMPTY_PAGE: 'thin',
  TIMEOUT: 'error',
  PAGE_CHANGED: 'error',
  INJECTION_FAILED: 'error',
  ANALYSIS_FAILED: 'error',
};

/** Restricted, No access, Thin and Error states from the ui.md states table. */
export function StateScreen() {
  const failure = useStore((s) => s.failure);
  const { goHome, retry, copy, failureDetails } = useStore.getState();
  const code = failure?.code ?? 'INJECTION_FAILED';
  const kind = KIND[code] ?? 'error';
  const text = S.states[code] ?? S.states.INJECTION_FAILED;

  return (
    <>
      <Header onBack={goHome} />
      <main data-state={kind} data-code={code}>
        {kind === 'restricted' && (
          <StateBlock icon={Lock} title={text.title} body={text.body}>
            <Button variant="secondary" onClick={goHome}>
              {S.back}
            </Button>
          </StateBlock>
        )}
        {kind === 'noAccess' && (
          <StateBlock icon={Lock} title={text.title} body={text.body}>
            <p className="w-full text-sm text-faint">
              <Keycap>{S.shortcut}</Keycap>
            </p>
            <Button variant="secondary" onClick={goHome}>
              {S.back}
            </Button>
          </StateBlock>
        )}
        {kind === 'thin' && (
          <StateBlock
            icon={AlertTriangle}
            iconClass="text-warning"
            title={text.title}
            body={text.body}
          >
            <Button variant="primary" onClick={retry}>
              <RotateCcw size={16} aria-hidden />
              {S.rerun}
            </Button>
          </StateBlock>
        )}
        {kind === 'error' && (
          <StateBlock
            icon={AlertTriangle}
            iconClass="text-danger"
            title={text.title}
            body={text.body}
          >
            <Button variant="primary" onClick={retry}>
              <RotateCcw size={16} aria-hidden />
              {S.retry}
            </Button>
            {(code === 'INJECTION_FAILED' || code === 'ANALYSIS_FAILED') && (
              <Button variant="secondary" onClick={() => copy(failureDetails())}>
                <Copy size={16} aria-hidden />
                {S.copyDetails}
              </Button>
            )}
          </StateBlock>
        )}
      </main>
    </>
  );
}
