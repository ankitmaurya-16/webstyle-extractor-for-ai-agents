// Analysis worker: one ANALYZE in, PROGRESS updates, then RESULT or ERROR. The panel terminates
// the worker after every run.

import { analyze } from './index.js';
import { MSG } from '../messaging.js';

self.onmessage = (event) => {
  const message = event.data;
  if (!message || message.type !== MSG.ANALYZE) return;
  const { requestId, raw } = message;
  try {
    const design = analyze(raw, (stage) =>
      self.postMessage({ type: MSG.PROGRESS, requestId, stage }),
    );
    self.postMessage({ type: MSG.RESULT, requestId, design });
  } catch (error) {
    self.postMessage({
      type: MSG.ERROR,
      requestId,
      code: 'ANALYSIS_FAILED',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
};
