import { describe, expect, it } from 'vitest';
import { airtableRequestError, parseAirtableError } from '../lib/airtable-errors';

describe('safe Airtable errors', () => {
  it('keeps status, operation, type, and a known field without response values', () => {
    const error = airtableRequestError('Create application', 422, JSON.stringify({ error: {
      type: 'INVALID_VALUE_FOR_COLUMN', message: 'field "Status" refused value "PRIVATE_APPLICANT"',
    } }));
    expect(error.cause).toEqual({ operation: 'Create application', status: 422, airtableErrorType: 'INVALID_VALUE_FOR_COLUMN', fieldName: 'Status' });
    expect(error.message).not.toContain('PRIVATE_APPLICANT');
    expect(JSON.stringify(error.cause)).not.toContain('PRIVATE_APPLICANT');
  });

  it('does not log arbitrary quoted values as field names', () => {
    const error = airtableRequestError('Lookup', 422, JSON.stringify({ error: {
      type: 'UNKNOWN_FIELD_NAME', message: 'Unknown field name: "PRIVATE_APPLICANT"',
    } }));
    expect(error.message).not.toContain('PRIVATE_APPLICANT');
    expect(error.cause).not.toHaveProperty('fieldName');
  });

  it.each(['not JSON PRIVATE_APPLICANT', 'null', '{"error":"PRIVATE_APPLICANT"}'])('handles invalid bodies without including them: %s', body => {
    expect(airtableRequestError('Lookup', 502, body).message).toBe('Lookup (502; UNKNOWN_ERROR)');
    expect(parseAirtableError(body)).toBeNull();
  });
});
