import { beforeAll, describe, expect, it } from 'vitest';
import { MSG } from '../../../src/messaging.js';
import { analyzeFixture } from '../helpers.js';

let onmessage;
const posted = [];

beforeAll(async () => {
  globalThis.self = { postMessage: (message) => posted.push(message) };
  await import('../../../src/analyze/worker.js');
  onmessage = globalThis.self.onmessage;
});

describe('analysis worker', () => {
  it('AC-F38.9 mapping runs in the analysis worker', () => {
    const design = analyzeFixture('classic');
    posted.length = 0;
    onmessage({
      data: {
        type: MSG.MAP,
        requestId: 'r1',
        design,
        fileText: ':root { --brand: #2563eb; }',
        fileName: 'mine.css',
      },
    });
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: MSG.MAP_RESULT, requestId: 'r1' });
    expect(
      posted[0].mapping.entries.some((e) => e.userToken === '--brand' && e.status === 'exact'),
    ).toBe(true);
  });

  it('AC-F38.9 an unreadable token file is a MAPPING_PARSE_FAILED error from the worker', () => {
    posted.length = 0;
    onmessage({
      data: {
        type: MSG.MAP,
        requestId: 'r2',
        design: analyzeFixture('classic'),
        fileText: 'not tokens',
        fileName: 'x.txt',
      },
    });
    expect(posted[0]).toMatchObject({
      type: MSG.ERROR,
      requestId: 'r2',
      code: 'MAPPING_PARSE_FAILED',
    });
  });

  it('AC-F39.1 diff runs in the analysis worker', () => {
    posted.length = 0;
    onmessage({
      data: {
        type: MSG.DIFF,
        requestId: 'r3',
        a: analyzeFixture('classic'),
        b: analyzeFixture('utility'),
      },
    });
    expect(posted[0]).toMatchObject({ type: MSG.DIFF_RESULT, requestId: 'r3' });
    expect(posted[0].diff.counts.added + posted[0].diff.counts.removed).toBeGreaterThan(0);
  });
});
