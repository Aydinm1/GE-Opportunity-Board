function sendHeightToParent() {
  const height = document.body.scrollHeight;
  parent.postMessage({ type: 'resize-iframe', height }, '*');
}

// Send height once when the page is loaded
window.addEventListener('load', sendHeightToParent);

// Optionally observe size changes (e.g., if dynamic content expands)
const resizeObserver = new ResizeObserver(() => sendHeightToParent());
resizeObserver.observe(document.body);
