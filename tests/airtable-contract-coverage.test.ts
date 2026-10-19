import { afterEach, describe, expect, it } from 'vitest';
import { AIRTABLE_SCHEMA_CONTRACT } from '../lib/airtable-schema-contract';
import { compareAirtableSchema } from '../lib/airtable-schema-check';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; });

function schemaFixture() {
  return {
    tables: Object.values(AIRTABLE_SCHEMA_CONTRACT).map((table, i) => {
      process.env[table.envVar] = table.fallbackName;
      return {
        id: `tbl${i}`, name: table.fallbackName,
        fields: table.fields.map((field, j) => ({
          id: `fld${i}_${j}`, name: field.name, type: field.expectedTypes[0],
          options: { choices: (field.expectedOptions ?? []).map(name => ({ name })) },
        })),
      };
    }),
  };
}

const fields = Object.values(AIRTABLE_SCHEMA_CONTRACT).flatMap(table =>
  table.fields.map(field => ({ table: table.fallbackName, field }))
);

describe('coverage for every app-dependent Airtable field', () => {
  it('accepts a complete supported schema', () => {
    expect(compareAirtableSchema(schemaFixture())).toEqual([]);
  });

  it.each(Object.values(AIRTABLE_SCHEMA_CONTRACT))('detects a missing required table $fallbackName', table => {
    const schema = schemaFixture();
    schema.tables = schema.tables.filter(t => t.name !== table.fallbackName);
    expect(compareAirtableSchema(schema)).toContain(`Missing Airtable table "${table.fallbackName}" for ${table.envVar}.`);
  });

  it.each(fields.filter(({ field }) => field.required !== false))('detects a missing or renamed $table.$field.name', ({ table, field }) => {
    const schema = schemaFixture();
    const actual = schema.tables.find(t => t.name === table)!;
    actual.fields = actual.fields.filter(f => f.name !== field.name);
    expect(compareAirtableSchema(schema).some(message => message.includes(field.name))).toBe(true);
  });

  it.each(fields)('detects an incompatible type for $table.$field.name', ({ table, field }) => {
    const schema = schemaFixture();
    schema.tables.find(t => t.name === table)!.fields.find(f => f.name === field.name)!.type = 'unsupportedType';
    expect(compareAirtableSchema(schema).some(message => message.includes(field.name) && message.includes('unsupportedType'))).toBe(true);
  });

  const selectableFields = fields.filter(({ field }) => field.expectedOptions?.length);
  it.each(selectableFields)('detects missing and differently cased choices for $table.$field.name', ({ table, field }) => {
    for (const option of field.expectedOptions!) {
      const schema = schemaFixture();
      const actual = schema.tables.find(t => t.name === table)!.fields.find(f => f.name === field.name)!;
      actual.options.choices = actual.options.choices.filter(choice => choice.name !== option);
      expect(compareAirtableSchema(schema)).toContain(`${table}.${field.name}: missing Airtable options [${option}].`);
      const changedCase = option.toLowerCase() === option ? option.toUpperCase() : option.toLowerCase();
      if (changedCase !== option) {
        actual.options.choices.push({ name: changedCase });
        expect(compareAirtableSchema(schema)).toContain(`${table}.${field.name}: missing Airtable options [${option}].`);
      }
    }
  });

  it.each(selectableFields)('accepts explicitly supported text variants for $table.$field.name', ({ table, field }) => {
    if (!field.expectedTypes.includes('singleLineText')) return;
    const schema = schemaFixture();
    const actual = schema.tables.find(t => t.name === table)!.fields.find(f => f.name === field.name)!;
    actual.type = 'singleLineText';
    actual.options.choices = [];
    expect(compareAirtableSchema(schema)).toEqual([]);
  });

  it('requires the actual form and workflow choices, independently of generated fixtures', () => {
    const people = AIRTABLE_SCHEMA_CONTRACT.people.fields;
    expect(people.find(f => f.name === 'Gender')?.expectedOptions).toEqual(['Female', 'Male', 'Non-Binary', 'Prefer not to share']);
    expect(people.find(f => f.name === 'Age')?.expectedOptions).toEqual(['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', 'Above 64', 'Prefer not to share']);
    for (const name of ['Country of Birth', 'Country of Living (Current Location)']) {
      expect(people.find(f => f.name === name)?.expectedOptions).toEqual(expect.arrayContaining(['Canada', 'United States']));
    }
    expect(people.find(f => f.name === 'Candidate Status')?.expectedOptions).toEqual(['1a - Applicant']);
    expect(AIRTABLE_SCHEMA_CONTRACT.applications.fields.find(f => f.name === 'Status')?.expectedOptions).toEqual(['1a - Applicant']);
    expect(AIRTABLE_SCHEMA_CONTRACT.applications.fields.find(f => f.name === 'Source')?.expectedOptions).toEqual(['Opportunity Board']);
  });
});
