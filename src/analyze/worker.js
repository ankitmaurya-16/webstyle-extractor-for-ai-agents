// Analysis worker: ANALYZE (captures and edit log to extracted and edited designs), MAP (F38)
// and DIFF (F39). The panel terminates the worker after every run.

import { analyze } from './index.js';
import { replay } from '../edit/apply-edit.js';
import { mapTokens } from '../mapping/index.js';
import { diffDesigns } from '../diff/index.js';
import { MSG } from '../messaging.js';

const fail = (requestId, code, error) =>
  self.postMessage({
    type: MSG.ERROR,
    requestId,
    code,
    detail: error instanceof Error ? error.message : String(error),
  });

self.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  const { requestId } = message;
  if (message.type === MSG.ANALYZE) {
    try {
      const extracted = analyze(message.captures, message.options ?? {}, (stage) =>
        self.postMessage({ type: MSG.PROGRESS, requestId, stage }),
      );
      self.postMessage({ type: MSG.PROGRESS, requestId, stage: 'replay' });
      const { design, staleEdits } = replay(extracted, message.edits ?? []);
      self.postMessage({ type: MSG.RESULT, requestId, extracted, edited: design, staleEdits });
    } catch (error) {
      fail(requestId, 'ANALYSIS_FAILED', error);
    }
  } else if (message.type === MSG.MAP) {
    try {
      const mapping = mapTokens(message.design, message.fileText, message.fileName);
      self.postMessage({ type: MSG.MAP_RESULT, requestId, mapping });
    } catch (error) {
      fail(requestId, error?.code ?? 'MAPPING_PARSE_FAILED', error);
    }
  } else if (message.type === MSG.DIFF) {
    try {
      self.postMessage({
        type: MSG.DIFF_RESULT,
        requestId,
        diff: diffDesigns(message.a, message.b),
      });
    } catch (error) {
      fail(requestId, 'ANALYSIS_FAILED', error);
    }
  }
};
