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

let resizeTimeout = null;
function sendHeightToParentDebounced(trigger = 'unknown') {
  if (window.parent === window) {
    return;
  }
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  resizeTimeout = setTimeout(() => {
    const height = computeFullHeight();
    try { parent.postMessage({ type: 'resize-iframe', height }, '*'); } catch (e) {}
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
