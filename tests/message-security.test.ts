import { afterEach, describe, expect, it, vi } from 'vitest';
import { isTrustedParentMessage, normalizeOrigin, parseTrustedRedirectUrl } from '../lib/message-security';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('message-security helpers', () => {
  it('normalizes valid origins and rejects invalid ones', () => {
    expect(normalizeOrigin('https://the.ismaili')).toBe('https://the.ismaili');
    expect(normalizeOrigin('https://the.ismaili/globalencounters/opportunities')).toBe('https://the.ismaili');
    expect(normalizeOrigin('not-a-url')).toBeNull();
  });

  it('accepts redirect URLs only from trusted origin', () => {
    const trusted = 'https://the.ismaili';

    const accepted = parseTrustedRedirectUrl('https://the.ismaili/globalencounters/opportunities?job=rec1', trusted);
    expect(accepted).not.toBeNull();
    expect(accepted?.searchParams.get('job')).toBe('rec1');

    expect(parseTrustedRedirectUrl('https://evil.example/path?job=rec1', trusted)).toBeNull();
    expect(parseTrustedRedirectUrl('javascript:alert(1)', trusted)).toBeNull();
    expect(parseTrustedRedirectUrl('', trusted)).toBeNull();
  });

  it('requires matching origin and parent source for postMessage trust', () => {
    const parentWindow = {} as Window;
    vi.stubGlobal('window', { parent: parentWindow });

    const trustedEvent = {
      origin: 'https://the.ismaili',
      source: parentWindow,
    } as MessageEvent;

    const wrongOriginEvent = {
      origin: 'https://evil.example',
      source: parentWindow,
    } as MessageEvent;

    const wrongSourceEvent = {
      origin: 'https://the.ismaili',
      source: {} as Window,
    } as MessageEvent;

    expect(isTrustedParentMessage(trustedEvent, 'https://the.ismaili')).toBe(true);
    expect(isTrustedParentMessage(wrongOriginEvent, 'https://the.ismaili')).toBe(false);
    expect(isTrustedParentMessage(wrongSourceEvent, 'https://the.ismaili')).toBe(false);
  });
});
