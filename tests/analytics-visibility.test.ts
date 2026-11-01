import { describe, expect, it } from 'vitest';
import { intersectsViewport } from '../lib/analytics-visibility';

describe('role visibility without IntersectionObserver', () => {
  it.each([
    ['visible', 10, 10, 100, 100, true],
    ['partially visible at the bottom', 10, 590, 100, 100, true],
    ['partially visible at the top', 10, -50, 100, 100, true],
    ['below the viewport', 10, 700, 100, 100, false],
    ['above the viewport', 10, -200, 100, 100, false],
    ['right of the viewport', 900, 10, 100, 100, false],
    ['left of the viewport', -200, 10, 100, 100, false],
    ['touching the bottom edge', 10, 600, 100, 100, false],
    ['hidden/zero width', 10, 10, 0, 100, false],
    ['hidden/zero height', 10, 10, 100, 0, false],
  ])('%s', (_name, left: number, top: number, width: number, height: number, visible: boolean) => {
    const element = { getBoundingClientRect: () => ({ left, top, width, height, bottom: top + height, right: left + width }) as DOMRect };
    expect(intersectsViewport(element, { width: 800, height: 600 })).toBe(visible);
  });
  it('rechecks current geometry when scrolling brings a role into view', () => {
    let top = 700;
    const element = { getBoundingClientRect: () => ({ left: 10, right: 110, top, bottom: top + 100, width: 100, height: 100 }) as DOMRect };
    expect(intersectsViewport(element, { width: 800, height: 600 })).toBe(false);
    top = 500;
    expect(intersectsViewport(element, { width: 800, height: 600 })).toBe(true);
  });
});
