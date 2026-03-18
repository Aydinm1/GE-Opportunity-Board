import { AIRTABLE_SCHEMA_CONTRACT, type AirtableFieldContract, type AirtableTableContract } from './airtable-schema-contract';

type AirtableSchemaField = {
  id: string;
  name: string;
  type: string;
  options?: {
    choices?: Array<{
      id?: string;
      name: string;
    }>;
  };
};

type AirtableSchemaTable = {
  id: string;
  name: string;
  fields: AirtableSchemaField[];
};

type AirtableSchemaResponse = {
  tables: AirtableSchemaTable[];
};

const TYPE_LABELS: Record<string, string> = {
  checkbox: 'boolean',
  date: 'date',
  email: 'text',
  formula: 'formula',
  multilineText: 'text',
  multipleAttachments: 'array[attachments]',
  multipleRecordLinks: 'array[recordIds]',
  multipleSelects: 'array[strings]',
  number: 'number',
  phoneNumber: 'text',
  singleLineText: 'text',
  singleSelect: 'string',
  url: 'text',
};

function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function friendlyTypeLabel(type: string) {
  return TYPE_LABELS[type] || type;
}

function formatExpectedType(expectedTypes: string[]) {
  if (expectedTypes.length === 1) {
    return `${friendlyTypeLabel(expectedTypes[0])} (${expectedTypes[0]})`;
  }

  return expectedTypes
    .map((expectedType) => `${friendlyTypeLabel(expectedType)} (${expectedType})`)
    .join(' or ');
}

function formatActualField(field: AirtableSchemaField) {
  return `"${field.name}" with type ${friendlyTypeLabel(field.type)} (${field.type})`;
}

function formatOptionList(options: readonly string[]) {
  return `[${options.join(', ')}]`;
}

function selectChoices(field: AirtableSchemaField) {
  return (field.options?.choices ?? [])
    .map((choice) => choice.name)
    .filter((choice) => typeof choice === 'string' && choice.trim() !== '');
}

function compareSelectOptions(
  tableName: string,
  expectedField: AirtableFieldContract,
  actualField: AirtableSchemaField
) {
  if (!expectedField.expectedOptions || expectedField.expectedOptions.length === 0) {
    return [];
  }

  if (actualField.type !== 'singleSelect' && actualField.type !== 'multipleSelects') {
    return [
      `${tableName}.${expectedField.name}: expected selectable options ${formatOptionList(expectedField.expectedOptions)}, but field type is ${actualField.type}.`,
    ];
  }

  const expected = expectedField.expectedOptions;
  const actual = selectChoices(actualField);
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((option) => !actualSet.has(option));

  if (expectedField.optionValidation === 'contains') {
    return missing.length > 0
      ? [`${tableName}.${expectedField.name}: missing Airtable options ${formatOptionList(missing)}.`]
      : [];
  }

  const unexpected = actual.filter((option) => !expectedSet.has(option));
  const failures: string[] = [];
  if (missing.length > 0) {
    failures.push(`${tableName}.${expectedField.name}: missing Airtable options ${formatOptionList(missing)}.`);
  }
  if (unexpected.length > 0) {
    failures.push(`${tableName}.${expectedField.name}: unexpected Airtable options ${formatOptionList(unexpected)}.`);
  }
  return failures;
}

function resolveTableName(contract: AirtableTableContract) {
  return process.env[contract.envVar] || contract.fallbackName;
}

function findTable(schema: AirtableSchemaResponse, contract: AirtableTableContract) {
  const identifier = resolveTableName(contract);
  return schema.tables.find((table) => table.name === identifier || table.id === identifier) || null;
}

function findClosestField(expectedField: AirtableFieldContract, actualFields: AirtableSchemaField[]) {
  if (actualFields.length === 0) return null;

  return actualFields
    .slice()
    .sort((left, right) => {
      const leftScore = levenshteinDistance(expectedField.name.toLowerCase(), left.name.toLowerCase());
      const rightScore = levenshteinDistance(expectedField.name.toLowerCase(), right.name.toLowerCase());
      return leftScore - rightScore;
    })[0];
}

export function formatSchemaMismatch(
  tableName: string,
  expectedField: AirtableFieldContract,
  actualField?: AirtableSchemaField | null
) {
  const expected = `"${expectedField.name}" with type ${formatExpectedType(expectedField.expectedTypes)}`;

  if (!actualField) {
    return `${tableName}.${expectedField.name}: expected ${expected}, but the field is missing.`;
  }

  return `${tableName}.${expectedField.name}: expected ${expected}, got ${formatActualField(actualField)}.`;
}

export function compareAirtableSchema(schema: AirtableSchemaResponse) {
  const failures: string[] = [];

  for (const contract of Object.values(AIRTABLE_SCHEMA_CONTRACT)) {
    const tableIdentifier = resolveTableName(contract);
    const actualTable = findTable(schema, contract);

    if (!actualTable) {
      failures.push(`Missing Airtable table "${tableIdentifier}" for ${contract.envVar}.`);
      continue;
    }

    for (const expectedField of contract.fields) {
      const actualField = actualTable.fields.find((field) => field.name === expectedField.name);
      if (!actualField) {
        failures.push(formatSchemaMismatch(actualTable.name, expectedField, findClosestField(expectedField, actualTable.fields)));
        continue;
      }

      if (!expectedField.expectedTypes.includes(actualField.type)) {
        failures.push(formatSchemaMismatch(actualTable.name, expectedField, actualField));
        continue;
      }

      failures.push(...compareSelectOptions(actualTable.name, expectedField, actualField));
    }
  }

  return failures;
}

export function requireAirtableSchemaEnv() {
  const missing: string[] = [];
  if (!process.env.AIRTABLE_TOKEN) missing.push('AIRTABLE_TOKEN');
  if (!process.env.AIRTABLE_BASE_ID) missing.push('AIRTABLE_BASE_ID');
  if (!process.env.AIRTABLE_GEROLES_TABLE) missing.push('AIRTABLE_GEROLES_TABLE');
  if (!process.env.AIRTABLE_PEOPLE_TABLE) missing.push('AIRTABLE_PEOPLE_TABLE');
  if (!process.env.AIRTABLE_APPLICATIONS_TABLE) missing.push('AIRTABLE_APPLICATIONS_TABLE');

  if (missing.length > 0) {
    throw new Error(`Missing Airtable schema test env vars: ${missing.join(', ')}`);
  }

  return {
    token: process.env.AIRTABLE_TOKEN!,
    baseId: process.env.AIRTABLE_BASE_ID!,
  };
}

export async function fetchAirtableSchema() {
  const { token, baseId } = requireAirtableSchemaEnv();
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const details = await res.text();
    throw new Error(
      `Airtable metadata request failed (${res.status}). Ensure AIRTABLE_TOKEN can read base schema metadata. ${details}`
    );
  }

  return await res.json() as AirtableSchemaResponse;
}

export async function assertLiveAirtableSchemaMatches() {
  const schema = await fetchAirtableSchema();
  const failures = compareAirtableSchema(schema);

  if (failures.length > 0) {
    throw new Error(['Airtable schema mismatches detected:', ...failures].join('\n'));
  }
}
