const ROOT_ID = 'opportunityboard-root';
const HEIGHT_CHANGE_EPSILON = 4;

function measureNodeHeight(node) {
  if (!node) return 0;

  return Math.max(
    node.scrollHeight || 0,
    node.offsetHeight || 0,
    Math.ceil(node.getBoundingClientRect ? node.getBoundingClientRect().height : 0) || 0
  );
}

function computeFullHeight() {
  const doc = document.documentElement;
  const body = document.body;
  const root = document.getElementById(ROOT_ID);
  const fallbackHeight = Math.max(
    measureNodeHeight(doc),
    measureNodeHeight(body)
  );

  if (!root) {
    return Math.ceil(fallbackHeight);
  }

  const rootBottom = root.getBoundingClientRect
    ? Math.ceil(root.getBoundingClientRect().bottom + window.pageYOffset)
    : 0;

  return Math.ceil(
    Math.max(
      rootBottom,
      measureNodeHeight(root)
    )
  );
}

let resizeTimeout = null;
let resizeFrame = null;
let lastSentHeight = 0;
const TARGET_PARENT_ORIGIN = (() => {
  try {
    return document.referrer ? new URL(document.referrer).origin : '*';
  } catch (e) {
    return '*';
  }
})();

function postHeightToParent() {
  const height = computeFullHeight();
  if (height <= 0) return;
  if (Math.abs(height - lastSentHeight) < HEIGHT_CHANGE_EPSILON) return;

  lastSentHeight = height;
  try { parent.postMessage({ type: 'resize-iframe', height }, TARGET_PARENT_ORIGIN); } catch (e) {}
}

function sendHeightToParentDebounced(trigger = 'unknown') {
  if (window.parent === window) {
    return;
  }
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame);
  }
  if (resizeTimeout) {
    clearTimeout(resizeTimeout);
  }
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = null;
    resizeTimeout = setTimeout(() => {
      postHeightToParent();
      resizeTimeout = null;
    }, 80);
  });
}

window.addEventListener('load', () => sendHeightToParentDebounced('window-load'));
window.addEventListener('resize', () => sendHeightToParentDebounced('window-resize'));
window.addEventListener('orientationchange', () => sendHeightToParentDebounced('orientation-change'));
window.addEventListener('opportunityboard:request-resize', () => sendHeightToParentDebounced('manual-request'));

const mutationObserver = new MutationObserver(() => sendHeightToParentDebounced('mutation'));
mutationObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true });

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(() => sendHeightToParentDebounced('ResizeObserver'));
  const observedNodes = [document.documentElement, document.body, document.getElementById(ROOT_ID)]
    .filter(Boolean);

  observedNodes.forEach((node) => ro.observe(node));
}

if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => sendHeightToParentDebounced('fonts-ready')).catch(() => {});
}

sendHeightToParentDebounced('initial');
