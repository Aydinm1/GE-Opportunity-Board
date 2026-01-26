// Debug logging
const DEBUG = true;
const log = (...args) => DEBUG && console.log('[resize-child]', ...args);

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
  if (e.data && e.data.type) {
    log('Message received:', e.data.type, e.data);
  }
  if (e.data && e.data.type === 'opportunityboard:modal-open') {
    log('modalOpen changing from', modalOpen, 'to true');
    modalOpen = true;
    log('modalOpen is now:', modalOpen);
  } else if (e.data && e.data.type === 'opportunityboard:modal-close') {
    log('modalOpen changing from', modalOpen, 'to false');
    modalOpen = false;
    log('modalOpen is now:', modalOpen);
    sendHeightToParentDebounced('modal-close'); // Recalculate after modal closes
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
function sendHeightToParentDebounced(trigger = 'unknown') {
  log('sendHeightToParentDebounced called, trigger:', trigger, 'modalOpen:', modalOpen);
  if (modalOpen) {
    log('BLOCKED - modal is open (early check)');
    return;
  }
  if (resizeTimeout) {
    log('Clearing existing timeout');
    clearTimeout(resizeTimeout);
  }
  resizeTimeout = setTimeout(() => {
    log('Debounce timeout fired, trigger:', trigger, 'modalOpen:', modalOpen);
    if (modalOpen) {
      log('BLOCKED - modal is open (debounce check)');
      resizeTimeout = null;
      return;
    }
    const height = computeFullHeight();
    log('Computed height:', height, '- posting to parent');
    try { parent.postMessage({ type: 'resize-iframe', height }, PARENT_ORIGIN); }
    catch (err) { try { parent.postMessage({ type: 'resize-iframe', height }, '*'); } catch (e) {} }
    resizeTimeout = null;
  }, 100);
}

// Send height once when the page is loaded
window.addEventListener('load', () => sendHeightToParentDebounced('window-load'));
window.addEventListener('resize', () => sendHeightToParentDebounced('window-resize'));

// Observe structural changes that may affect layout
const mutationObserver = new MutationObserver(() => sendHeightToParentDebounced('mutation'));
mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

// Observe element resizes
if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => sendHeightToParentDebounced('ResizeObserver'));
  ro.observe(document.body);
}

// Initial kick
log('Script initialized');
sendHeightToParentDebounced('initial');
