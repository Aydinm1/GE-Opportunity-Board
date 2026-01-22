// Compute a robust document height that includes fixed-position elements (like a modal)
function computeFullHeight() {
  const doc = document.documentElement;
  const body = document.body;

  // Base heights from normal flow
  const base = Math.max(doc.scrollHeight || 0, body.scrollHeight || 0, doc.offsetHeight || 0, body.offsetHeight || 0);

  // Some UI (modals, fixed elements) are taken out of the flow. Measure the bottom-most
  // edge of every element and use that as a candidate height.
  let maxBottom = 0;
  const nodes = document.querySelectorAll('body *');
  for (let i = 0; i < nodes.length; i++) {
    try {
      const r = nodes[i].getBoundingClientRect();
      const bottom = r.bottom + window.pageYOffset;
      if (bottom > maxBottom) maxBottom = bottom;
    } catch (e) {
      // ignore any elements that throw on getBoundingClientRect
    }
  }

  // Also consider the visible viewport bottom (useful if content is shorter than viewport)
  const viewportBottom = window.pageYOffset + window.innerHeight;

  return Math.ceil(Math.max(base, maxBottom, viewportBottom));
}

let resizeTimeout = null;
function sendHeightToParentDebounced() {
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    const height = computeFullHeight();
    parent.postMessage({ type: 'resize-iframe', height }, '*');
    resizeTimeout = null;
  }, 100);
}

// Send height once when the page is loaded
window.addEventListener('load', sendHeightToParentDebounced);
window.addEventListener('resize', sendHeightToParentDebounced);

// Observe structural changes that may affect layout
const mutationObserver = new MutationObserver(sendHeightToParentDebounced);
mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

// Observe element resizes
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(sendHeightToParentDebounced);
  ro.observe(document.body);
}

// Initial kick
sendHeightToParentDebounced();
