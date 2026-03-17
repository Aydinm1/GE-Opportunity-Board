export type AirtableFieldContract = {
  name: string;
  expectedTypes: string[];
  usage: 'read' | 'write' | 'readWrite';
};

export type AirtableTableContract = {
  envVar: 'AIRTABLE_GEROLES_TABLE' | 'AIRTABLE_PEOPLE_TABLE' | 'AIRTABLE_APPLICATIONS_TABLE';
  fallbackName: string;
  fields: AirtableFieldContract[];
};

export const AIRTABLE_SCHEMA_CONTRACT: Record<'jobs' | 'people' | 'applications', AirtableTableContract> = {
  jobs: {
    envVar: 'AIRTABLE_GEROLES_TABLE',
    fallbackName: 'GE Roles',
    fields: [
      { name: 'Role Title', expectedTypes: ['singleLineText', 'formula'], usage: 'read' },
      { name: 'Displayed Status', expectedTypes: ['formula', 'singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Published?', expectedTypes: ['checkbox', 'formula'], usage: 'read' },
      { name: 'Programme / Functional Area', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Team/Vertical', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Location / Base', expectedTypes: ['singleLineText'], usage: 'read' },
      { name: 'Work Type', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Role Type', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Start Date', expectedTypes: ['date'], usage: 'read' },
      { name: 'Duration (Months)', expectedTypes: ['number', 'formula'], usage: 'read' },
      { name: 'Duration Categories', expectedTypes: ['formula', 'singleSelect', 'singleLineText'], usage: 'read' },
      { name: 'Displayed Purpose of the Role', expectedTypes: ['formula', 'multilineText', 'singleLineText'], usage: 'read' },
      { name: 'Key Responsibilities', expectedTypes: ['multilineText'], usage: 'read' },
      { name: '10. Required Qualifications', expectedTypes: ['multilineText', 'multipleSelects'], usage: 'read' },
      { name: 'Other Required Qualifications', expectedTypes: ['multilineText', 'singleLineText'], usage: 'read' },
      { name: 'Preferred Qualifications', expectedTypes: ['multilineText', 'multipleSelects'], usage: 'read' },
      { name: 'Additional Skill Notes', expectedTypes: ['multilineText', 'singleLineText'], usage: 'read' },
      { name: 'Displayed Estimated Time Commitment', expectedTypes: ['formula', 'singleLineText', 'singleSelect'], usage: 'read' },
      { name: 'Languages Required', expectedTypes: ['multipleSelects', 'multilineText'], usage: 'read' },
    ],
  },
  people: {
    envVar: 'AIRTABLE_PEOPLE_TABLE',
    fallbackName: 'People',
    fields: [
      { name: 'Full Name', expectedTypes: ['singleLineText'], usage: 'write' },
      { name: 'Candidate Status', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Email Address', expectedTypes: ['email', 'singleLineText'], usage: 'readWrite' },
      { name: 'Phone Number (incl. Country Code)', expectedTypes: ['phoneNumber', 'singleLineText'], usage: 'write' },
      { name: 'LinkedIn Profile Link (if available)', expectedTypes: ['url', 'singleLineText'], usage: 'write' },
      { name: 'Age', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Gender', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Country of Birth', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Country of Living (Current Location)', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Jurisdiction', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Academic / Professional Education', expectedTypes: ['multilineText'], usage: 'write' },
      { name: 'Current Profession / Occupation', expectedTypes: ['multilineText', 'singleLineText'], usage: 'write' },
      { name: 'Jamati Experience', expectedTypes: ['multilineText'], usage: 'write' },
      { name: 'normalized email', expectedTypes: ['formula', 'singleLineText'], usage: 'read' },
    ],
  },
  applications: {
    envVar: 'AIRTABLE_APPLICATIONS_TABLE',
    fallbackName: 'Applications',
    fields: [
      { name: 'People', expectedTypes: ['multipleRecordLinks'], usage: 'write' },
      { name: 'GE Roles', expectedTypes: ['multipleRecordLinks'], usage: 'write' },
      { name: 'Status', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Source', expectedTypes: ['singleSelect', 'singleLineText'], usage: 'write' },
      { name: 'Why are you interested in or qualified for this job?', expectedTypes: ['multilineText'], usage: 'write' },
      { name: 'CV / Resume', expectedTypes: ['multipleAttachments'], usage: 'write' },
      { name: 'Idempotency Key', expectedTypes: ['singleLineText'], usage: 'write' },
    ],
  },
};
