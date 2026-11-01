// Correlation only: these IDs never identify an applicant or authorize a retry.
export function safeRequestId(value: string | null) {
  return value && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value) ? value.toLowerCase() : null;
}

export function createRequestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = Math.floor(Math.random() * 16);
    return (char === 'x' ? random : (random & 3) | 8).toString(16);
  });
}

export function safeEdgeRequestId(value: string | null) {
  return value && /^[a-f0-9]{16,32}(?:-[a-z]{3})?$/i.test(value) ? value : null;
}
