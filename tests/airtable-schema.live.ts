import { describe, it } from 'vitest';
import { assertLiveAirtableSchemaMatches } from '../lib/airtable-schema-check';

describe('live Airtable schema contract', () => {
  it('matches the configured base schema', async () => {
    await assertLiveAirtableSchemaMatches();
  });
});
