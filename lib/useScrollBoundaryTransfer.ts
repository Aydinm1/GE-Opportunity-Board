import { RefObject, useEffect } from 'react';

const EDGE_EPSILON = 1;

export const useScrollBoundaryTransfer = (
  containerRef: RefObject<HTMLElement | null>,
  enabled = true
) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const el = containerRef.current;
    if (!el) return;

    let lastTouchY: number | null = null;

    const isAtTop = () => el.scrollTop <= EDGE_EPSILON;
    const isAtBottom = () =>
      el.scrollTop + el.clientHeight >= el.scrollHeight - EDGE_EPSILON;
    const isScrollable = () => el.scrollHeight > el.clientHeight + EDGE_EPSILON;

    const transferToPage = (deltaY: number) => {
      if (deltaY === 0) return false;

      if (!isScrollable()) {
        window.scrollBy(0, deltaY);
        return true;
      }

      if (deltaY > 0 && isAtBottom()) {
        window.scrollBy(0, deltaY);
        return true;
      }

      if (deltaY < 0 && isAtTop()) {
        window.scrollBy(0, deltaY);
        return true;
      }

      return false;
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      lastTouchY = event.touches[0].clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1 || lastTouchY === null) return;
      const currentY = event.touches[0].clientY;
      const deltaY = lastTouchY - currentY;
      if (transferToPage(deltaY)) {
        event.preventDefault();
      }
      lastTouchY = currentY;
    };

    const resetTouch = () => {
      lastTouchY = null;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', resetTouch, { passive: true });
    el.addEventListener('touchcancel', resetTouch, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', resetTouch);
      el.removeEventListener('touchcancel', resetTouch);
    };
  }, [containerRef, enabled]);
};
