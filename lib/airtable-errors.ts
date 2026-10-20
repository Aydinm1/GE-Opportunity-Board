import { AIRTABLE_SCHEMA_CONTRACT } from './airtable-schema-contract';

const KNOWN_FIELDS = new Set(Object.values(AIRTABLE_SCHEMA_CONTRACT).flatMap(table => table.fields.map(field => field.name)));

export function parseAirtableError(details: string): { type?: string; message?: string } | null {
  try {
    const error = JSON.parse(details)?.error;
    if (!error || typeof error !== 'object') return null;
    return {
      type: typeof error.type === 'string' ? error.type : undefined,
      message: typeof error.message === 'string' ? error.message : undefined,
    };
  } catch {
    return null;
  }
}

export function airtableRequestError(operation: string, status: number | undefined, details: string): Error {
  const error = parseAirtableError(details);
  const airtableErrorType = error?.type && /^[A-Z_]{1,80}$/.test(error.type) ? error.type : 'UNKNOWN_ERROR';
  // Never treat an arbitrary quoted response value as a field name.
  const match = error?.message?.match(/(?:Unknown field name:\s*|\bfield\s+)["']([^"']+)["']/i);
  const fieldName = match && KNOWN_FIELDS.has(match[1]) ? match[1] : undefined;
  const safeError = new Error(`${operation} (${status ?? 'unknown status'}; ${airtableErrorType}${fieldName ? `; field ${fieldName}` : ''})`);
  safeError.cause = { operation, status, airtableErrorType, ...(fieldName ? { fieldName } : {}) };
  return safeError;
}
