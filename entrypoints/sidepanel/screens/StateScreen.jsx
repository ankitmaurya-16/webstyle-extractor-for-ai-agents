import { AlertTriangle, Copy, Lock, RotateCcw } from 'lucide-react';
import { useStore } from '../store.js';
import { t } from '../../../src/i18n.js';
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
  DEBUGGER_ATTACH_FAILED: 'debugger',
  DEBUGGER_DENIED: 'debugger',
};

const TEXT = {
  RESTRICTED_PAGE: ['title_restricted', 'body_restricted'],
  FILE_ACCESS: ['title_restricted', 'body_file_access'],
  NO_ACCESS: ['title_no_access', 'body_no_access'],
  EMPTY_PAGE: ['title_thin', 'body_empty_page'],
  TIMEOUT: ['title_error', 'body_timeout'],
  PAGE_CHANGED: ['title_error', 'body_page_changed'],
  INJECTION_FAILED: ['title_error', 'body_injection_failed'],
  ANALYSIS_FAILED: ['title_error', 'body_analysis_failed'],
  DEBUGGER_ATTACH_FAILED: ['title_debugger_attach_failed', 'body_debugger_attach_failed'],
  DEBUGGER_DENIED: ['title_debugger_attach_failed', 'toast_debugger_denied'],
};

/** Restricted, No access, Thin, Error and Advanced-capture failure states. */
export function StateScreen() {
  const failure = useStore((s) => s.failure);
  const { goHome, retry, runBasic, copy, failureDetails } = useStore.getState();
  const code = TEXT[failure?.code] ? failure.code : 'INJECTION_FAILED';
  const kind = KIND[code] ?? 'error';
  const [title, body] = TEXT[code].map((key) => t(key));

  return (
    <>
      <Header onBack={goHome} />
      <main data-state={kind} data-code={code}>
        {kind === 'restricted' && (
          <StateBlock icon={Lock} title={title} body={body}>
            <Button variant="secondary" onClick={goHome}>
              {t('back')}
            </Button>
          </StateBlock>
        )}
        {kind === 'noAccess' && (
          <StateBlock icon={Lock} title={title} body={body}>
            <p className="w-full text-sm text-faint">
              <Keycap>{t('shortcut')}</Keycap>
            </p>
            <Button variant="secondary" onClick={goHome}>
              {t('back')}
            </Button>
          </StateBlock>
        )}
        {kind === 'thin' && (
          <StateBlock icon={AlertTriangle} iconClass="text-warning" title={title} body={body}>
            <Button variant="primary" onClick={retry}>
              <RotateCcw size={16} aria-hidden />
              {t('rerun')}
            </Button>
          </StateBlock>
        )}
        {kind === 'debugger' && (
          <StateBlock icon={AlertTriangle} iconClass="text-danger" title={title} body={body}>
            <Button variant="primary" onClick={runBasic}>
              {t('run_basic')}
            </Button>
            <Button variant="secondary" onClick={retry}>
              <RotateCcw size={16} aria-hidden />
              {t('retry')}
            </Button>
          </StateBlock>
        )}
        {kind === 'error' && (
          <StateBlock icon={AlertTriangle} iconClass="text-danger" title={title} body={body}>
            <Button variant="primary" onClick={retry}>
              <RotateCcw size={16} aria-hidden />
              {t('retry')}
            </Button>
            {(code === 'INJECTION_FAILED' || code === 'ANALYSIS_FAILED') && (
              <Button variant="secondary" onClick={() => copy(failureDetails())}>
                <Copy size={16} aria-hidden />
                {t('copy_details')}
              </Button>
            )}
          </StateBlock>
        )}
      </main>
    </>
  );
}
