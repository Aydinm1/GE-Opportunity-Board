// Fallback for browsers without IntersectionObserver. A layout box alone does
// not prove visibility: it may be entirely beyond the current viewport.
export function intersectsViewport(element: Pick<Element, 'getBoundingClientRect'>, viewport: { width: number; height: number }) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < viewport.height && rect.left < viewport.width;
}
