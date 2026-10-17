import { describe, expect, it } from 'vitest';
import { classifyInjectionError, classifyUrl } from '../../../src/platform/errors.js';

describe('classifyUrl', () => {
  it('AC-F1.6 treats chrome://, view-source:, about: and the Web Store as restricted', () => {
    for (const url of [
      'chrome://settings/',
      'chrome-extension://abc/page.html',
      'view-source:https://example.com/',
      'about:blank',
      'https://chromewebstore.google.com/detail/x',
      'https://chrome.google.com/webstore/detail/x',
    ]) {
      expect(classifyUrl(url), url).toBe('RESTRICTED_PAGE');
    }
  });

  it('leaves normal and unknown URLs to the injection attempt', () => {
    expect(classifyUrl('https://example.com/')).toBeNull();
    expect(classifyUrl('file:///tmp/a.html')).toBeNull();
    expect(classifyUrl(undefined)).toBeNull();
    expect(classifyUrl('not a url')).toBeNull();
  });
});

describe('classifyInjectionError', () => {
  const cases = [
    ['Cannot access a chrome:// URL', undefined, 'RESTRICTED_PAGE'],
    ['The extensions gallery cannot be scripted.', undefined, 'RESTRICTED_PAGE'],
    [
      'Cannot access a chrome-extension:// URL of different extension',
      undefined,
      'RESTRICTED_PAGE',
    ],
    [
      'Cannot access contents of url "view-source:https://a.com/". Extension manifest must request permission to access this host.',
      undefined,
      'RESTRICTED_PAGE',
    ],
    [
      'Cannot access contents of url "file:///home/a.html". Extension manifest must request permission to access this host.',
      'file:///home/a.html',
      'FILE_ACCESS',
    ],
    [
      'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
      'https://a.com/',
      'NO_ACCESS',
    ],
    ['Missing host permission for the tab', 'https://a.com/', 'NO_ACCESS'],
    ['Frame with ID 0 was removed.', 'https://a.com/', 'PAGE_CHANGED'],
    ['No tab with id: 12.', undefined, 'PAGE_CHANGED'],
    ['Something unexpected', 'https://a.com/', 'INJECTION_FAILED'],
  ];

  it.each(cases)('maps "%s"', (message, url, code) => {
    expect(classifyInjectionError(new Error(message), url)).toBe(code);
  });

  it('AC-F1.7 reports FILE_ACCESS for a refused file:// tab even with the generic message', () => {
    const error = new Error(
      'Cannot access contents of the page. Extension manifest must request permission to access the respective host.',
    );
    expect(classifyInjectionError(error, 'file:///tmp/x.html')).toBe('FILE_ACCESS');
  });

  it('AC-F1.6 treats a failing PDF tab as restricted', () => {
    expect(classifyInjectionError(new Error('Unknown'), 'https://a.com/doc.pdf')).toBe(
      'RESTRICTED_PAGE',
    );
  });

  it('AC-F1.8 maps a missing activeTab grant to NO_ACCESS', () => {
    expect(
      classifyInjectionError(
        'Cannot access contents of url "https://a.com/". Extension manifest must request permission to access this host.',
        'https://a.com/',
      ),
    ).toBe('NO_ACCESS');
  });
});
