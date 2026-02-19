function computeFullHeight() {
  const doc = document.documentElement;
  const body = document.body;

  const base = Math.max(doc.scrollHeight || 0, body.scrollHeight || 0, doc.offsetHeight || 0, body.offsetHeight || 0);

  let maxBottom = 0;
  const nodes = document.querySelectorAll('body *');
  for (let i = 0; i < nodes.length; i++) {
    try {
      const el = nodes[i];
      const style = window.getComputedStyle(el);
      if (style.position === 'fixed' || style.position === 'absolute') continue;
      const r = el.getBoundingClientRect();
      const bottom = r.bottom + window.pageYOffset;
      if (bottom > maxBottom) maxBottom = bottom;
    } catch (e) {
    }
  }

  const viewportBottom = window.pageYOffset + window.innerHeight;

  return Math.ceil(Math.max(base, maxBottom, viewportBottom));
}

let PARENT_ORIGIN = '*';
let modalOpen = false;

window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'opportunityboard:modal-open') {
    modalOpen = true;
  } else if (e.data && e.data.type === 'opportunityboard:modal-close') {
    modalOpen = false;
    sendHeightToParentDebounced('modal-close');
  }
});

(async function initParentOrigin() {
  try {
    const res = await fetch('/host-origin.json');
    if (res.ok) {
      const j = await res.json();
      if (j && j.HOST_ORIGIN) { PARENT_ORIGIN = j.HOST_ORIGIN; return; }
    }
  } catch (e) {
  }

  try {
    if (document.referrer) {
      const u = new URL(document.referrer);
      if (u && u.origin) { PARENT_ORIGIN = u.origin; return; }
    }
  } catch (e) {
  }
})();

let resizeTimeout = null;
function sendHeightToParentDebounced(trigger = 'unknown') {
  if (modalOpen) {
    return;
  }
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  resizeTimeout = setTimeout(() => {
    if (modalOpen) {
      resizeTimeout = null;
      return;
    }
    const height = computeFullHeight();
    try { parent.postMessage({ type: 'resize-iframe', height }, PARENT_ORIGIN); }
    catch (err) { try { parent.postMessage({ type: 'resize-iframe', height }, '*'); } catch (e) {} }
    resizeTimeout = null;
  }, 100);
}

window.addEventListener('load', () => sendHeightToParentDebounced('window-load'));
window.addEventListener('resize', () => sendHeightToParentDebounced('window-resize'));

const mutationObserver = new MutationObserver(() => sendHeightToParentDebounced('mutation'));
mutationObserver.observe(document.body, { childList: true, subtree: true, attributes: true });

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => sendHeightToParentDebounced('ResizeObserver'));
  ro.observe(document.body);
}

sendHeightToParentDebounced('initial');
