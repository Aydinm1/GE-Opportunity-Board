export function normalizeOrigin(origin: string): string | null {
  if (typeof origin !== 'string') return null;
  const trimmed = origin.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function parseTrustedRedirectUrl(value: unknown, trustedOrigin: string): URL | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const expectedOrigin = normalizeOrigin(trustedOrigin);
  if (!expectedOrigin) return null;

  try {
    const parsed = new URL(trimmed);
    return parsed.origin === expectedOrigin ? parsed : null;
  } catch {
    return null;
  }
}

export function isTrustedParentMessage(event: MessageEvent, trustedOrigin: string): boolean {
  const expectedOrigin = normalizeOrigin(trustedOrigin);
  if (!expectedOrigin) return false;
  if (event.origin !== expectedOrigin) return false;

  if (typeof window !== 'undefined' && window.parent) {
    if (event.source !== window.parent) return false;
  }

  return true;
}
