import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadDotenv({ path: '.env' });

export default defineConfig({
  test: {
    include: ['tests/airtable-schema.live.ts'],
  },
});
