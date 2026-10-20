import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { HOST_ORIGIN } from '../lib/host-config';

vi.mock('@sentry/nextjs', () => ({ withSentryConfig: (config: unknown) => config }));
import nextConfig from '../next.config.mjs';

const childScript = readFileSync(new URL('../public/resize-child.js', import.meta.url), 'utf8');
const parentScript = readFileSync(new URL('../integrations/iframe/parent-script.txt', import.meta.url), 'utf8');

function childHarness({ origin = HOST_ORIGIN, referrer = '', standalone = false }: { origin?: string | null; referrer?: string; standalone?: boolean } = {}) {
  const sent = vi.fn();
  const events = new Map<string, () => void>();
  const frames = new Map<number, () => void>();
  const timers = new Map<number, () => void>();
  let counter = 0;
  const node = { scrollHeight: 1000, offsetHeight: 1000, getBoundingClientRect: () => ({ height: 1000, bottom: 1000 }) };
  const window = { parent: {} as unknown, pageYOffset: 0, addEventListener: (type: string, callback: () => void) => events.set(type, callback) };
  window.parent = standalone ? window : { postMessage: sent };
  vm.runInNewContext(childScript, {
    window, URL,
    document: {
      referrer, currentScript: origin === null ? null : { getAttribute: () => origin },
      documentElement: node, body: node, getElementById: () => node,
    },
    MutationObserver: class { observe() {} },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: (callback: () => void) => { const id = ++counter; frames.set(id, callback); return id; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
    setTimeout: (callback: () => void) => { const id = ++counter; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
  });
  const flush = () => {
    const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(callback => callback());
    const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback());
  };
  return { sent, events, flush, node };
}

describe('child resize boundary', () => {
  it.each(['', 'https://untrusted.example/path', 'not a URL', 'https://the.ismaili/path'])('uses configured origin regardless of referrer %s', referrer => {
    const harness = childHarness({ referrer }); harness.flush();
    expect(harness.sent).toHaveBeenCalledExactlyOnceWith({ type: 'resize-iframe', height: 1000 }, HOST_ORIGIN);
  });

  it.each([null, '', '*', 'invalid', 'https://the.ismaili/path', 'https://the.ismaili/', 'http://the.ismaili'])('sends nothing with missing or invalid configuration %s', origin => {
    const harness = childHarness({ origin, referrer: 'https://the.ismaili/path' }); harness.flush();
    expect(harness.sent).not.toHaveBeenCalled();
  });

  it('reads the supplied configuration rather than a hardcoded host', () => {
    const harness = childHarness({ origin: 'https://other-trusted.example' }); harness.flush();
    expect(harness.sent.mock.calls[0][1]).toBe('https://other-trusted.example');
  });

  it('does not send messages in standalone mode', () => {
    const harness = childHarness({ standalone: true });
    harness.events.get('resize')!(); harness.events.get('opportunityboard:request-resize')!(); harness.flush();
    expect(harness.sent).not.toHaveBeenCalled();
  });

  it('preserves debounce and height-change suppression', () => {
    const harness = childHarness();
    harness.events.get('resize')!(); harness.events.get('orientationchange')!(); harness.flush();
    expect(harness.sent).toHaveBeenCalledTimes(1);
    harness.events.get('resize')!(); harness.flush(); expect(harness.sent).toHaveBeenCalledTimes(1);
    harness.node.scrollHeight = 1250;
    harness.events.get('opportunityboard:request-resize')!(); harness.flush();
    expect(harness.sent).toHaveBeenLastCalledWith({ type: 'resize-iframe', height: 1250 }, HOST_ORIGIN);
  });
});

describe('response headers', () => {
  it('restricts framing to self and the configured host without blocking cross-origin embedding', async () => {
    const rules = await nextConfig.headers();
    const headers = Object.fromEntries(rules.find((rule: { source: string }) => rule.source === '/:path*')!.headers.map((header: { key: string; value: string }) => [header.key, header.value]));
    expect(headers['Content-Security-Policy']).toBe(`frame-ancestors 'self' ${HOST_ORIGIN}`);
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(headers['X-Frame-Options']).toBeUndefined();
  });
});

function parentHarness() {
  let listener: (event: unknown) => Promise<void>;
  const replies = vi.fn(); const copy = vi.fn().mockResolvedValue(undefined);
  const source = { postMessage: replies };
  const iframe = { contentWindow: source, style: { height: '' } };
  const window = { innerWidth: 1440, location: { href: `${HOST_ORIGIN}/globalencounters/opportunities?job=recTest` }, addEventListener: (_: string, callback: typeof listener) => { listener = callback; } };
  vm.runInNewContext(parentScript, { window, document: { getElementById: () => iframe }, navigator: { clipboard: { writeText: copy } } });
  return { replies, copy, iframe, window, send: (data: unknown, origin = 'https://ge-opp-board.the.ismaili', sender: unknown = source) => listener({ data, origin, source: sender }) };
}

describe('parent reference trust boundary', () => {
  it.each(['resize-iframe', 'opportunityboard:get-parent-url', 'opportunityboard:copy'])('rejects untrusted origin and wrong source for %s', async type => {
    const harness = parentHarness();
    const data = { type, id: 'request-1', height: 900, text: 'test' };
    await harness.send(data, 'https://untrusted.example');
    await harness.send(data, undefined, {});
    expect(harness.iframe.style.height).toBe(''); expect(harness.replies).not.toHaveBeenCalled(); expect(harness.copy).not.toHaveBeenCalled();
  });

  it('keeps trusted resize, parent URL and copy responses working', async () => {
    const harness = parentHarness();
    await harness.send({ type: 'resize-iframe', height: 1000 }); expect(harness.iframe.style.height).toBe('1000px');
    harness.window.innerWidth = 390;
    await harness.send({ type: 'resize-iframe', height: 20000 }); expect(harness.iframe.style.height).toBe('10000px');
    await harness.send({ type: 'opportunityboard:get-parent-url', id: 'url-1' });
    expect(harness.replies).toHaveBeenCalledWith({ type: 'opportunityboard:parent-url', id: 'url-1', url: harness.window.location.href }, 'https://ge-opp-board.the.ismaili');
    await harness.send({ type: 'opportunityboard:copy', id: 'copy-1', text: 'role link' });
    expect(harness.copy).toHaveBeenCalledWith('role link');
    expect(harness.replies).toHaveBeenLastCalledWith({ type: 'opportunityboard:copy-result', id: 'copy-1', ok: true, error: null }, 'https://ge-opp-board.the.ismaili');
  });
});
