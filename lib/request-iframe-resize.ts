export function requestIframeResize() {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;

  window.dispatchEvent(new Event('opportunityboard:request-resize'));
}
