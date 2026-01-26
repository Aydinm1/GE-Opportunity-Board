// Compute document height, skipping fixed/absolute elements (overlays like modals)
function computeFullHeight() {
  const doc = document.documentElement;
  const body = document.body;

  // Base heights from normal flow
  const base = Math.max(doc.scrollHeight || 0, body.scrollHeight || 0, doc.offsetHeight || 0, body.offsetHeight || 0);

  // Measure the bottom-most edge of every element in normal document flow
  let maxBottom = 0;
  const nodes = document.querySelectorAll('body *');
  for (let i = 0; i < nodes.length; i++) {
    try {
      const el = nodes[i];
      const style = window.getComputedStyle(el);
      // Skip fixed/absolute elements - they're overlays, not document content
      if (style.position === 'fixed' || style.position === 'absolute') continue;
      const r = el.getBoundingClientRect();
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

let PARENT_ORIGIN = '*';
let modalOpen = false;

// Listen for modal open/close messages from the app
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'opportunityboard:modal-open') {
    modalOpen = true;
  } else if (e.data && e.data.type === 'opportunityboard:modal-close') {
    modalOpen = false;
    sendHeightToParentDebounced(); // Recalculate after modal closes
  }
});

// Initialize parent origin with best-effort sources:
// 1) /host-origin.json served from iframe origin
// 2) document.referrer (origin)
// 3) fallback to '*'
(async function initParentOrigin() {
  try {
    const res = await fetch('/host-origin.json');
    if (res.ok) {
      const j = await res.json();
      if (j && j.HOST_ORIGIN) { PARENT_ORIGIN = j.HOST_ORIGIN; return; }
    }
  } catch (e) {
    // ignore
  }

  try {
    if (document.referrer) {
      const u = new URL(document.referrer);
      if (u && u.origin) { PARENT_ORIGIN = u.origin; return; }
    }
  } catch (e) {
    // ignore
  }

  // leave as '*'
})();

let resizeTimeout = null;
function sendHeightToParentDebounced() {
  if (modalOpen) return; // Don't send while modal is open
  if (resizeTimeout) clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (modalOpen) return; // Double-check in case modal opened during debounce
    const height = computeFullHeight();
    try { parent.postMessage({ type: 'resize-iframe', height }, PARENT_ORIGIN); }
    catch (err) { try { parent.postMessage({ type: 'resize-iframe', height }, '*'); } catch (e) {} }
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
