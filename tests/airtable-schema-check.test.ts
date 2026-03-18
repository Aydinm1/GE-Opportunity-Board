import { describe, expect, it } from 'vitest';
import {
  APPLICANT_STATUS,
  COUNTRY_OPTIONS,
  OPPORTUNITY_BOARD_SOURCE,
  PERSON_AGE_OPTIONS,
  PERSON_GENDER_OPTIONS,
} from '../lib/application-select-options';
import { compareAirtableSchema, formatSchemaMismatch } from '../lib/airtable-schema-check';

describe('airtable schema comparison', () => {
  it('formats mismatches with friendly field types', () => {
    expect(
      formatSchemaMismatch(
        'People',
        { name: 'Full Name', expectedTypes: ['singleLineText'], usage: 'write' },
        { id: 'fld1', name: 'Applicant', type: 'multipleSelects' }
      )
    ).toBe(
      'People.Full Name: expected "Full Name" with type text (singleLineText), got "Applicant" with type array[strings] (multipleSelects).'
    );
  });

  it('reports missing tables and mismatched fields', () => {
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const failures = compareAirtableSchema({
      tables: [
        {
          id: 'tblPeople',
          name: 'People',
          fields: [
            { id: 'fldApplicant', name: 'Applicant', type: 'multipleSelects' },
            { id: 'fldEmail', name: 'Email Address', type: 'email' },
          ],
        },
      ],
    });

    expect(failures).toContain('Missing Airtable table "GE Roles" for AIRTABLE_GEROLES_TABLE.');
    expect(failures).toContain('Missing Airtable table "Applications" for AIRTABLE_APPLICATIONS_TABLE.');
    expect(
      failures.some((failure) =>
        failure.includes('People.Full Name: expected "Full Name" with type text (singleLineText), got "Applicant" with type array[strings] (multipleSelects).')
      )
    ).toBe(true);
  });

  it('matches tables by Airtable table id from env vars', () => {
    process.env.AIRTABLE_GEROLES_TABLE = 'tblRoles123';
    process.env.AIRTABLE_PEOPLE_TABLE = 'tblPeople123';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'tblApps123';

    const failures = compareAirtableSchema({
      tables: [
        {
          id: 'tblRoles123',
          name: 'GE Roles',
          fields: [
            { id: 'fldRoleTitle', name: 'Role Title', type: 'singleLineText' },
            { id: 'fldDisplayedStatus', name: 'Displayed Status', type: 'singleSelect' },
            { id: 'fldPublished', name: 'Published?', type: 'checkbox' },
            { id: 'fldProgrammeArea', name: 'Programme / Functional Area', type: 'singleSelect' },
            { id: 'fldTeamVertical', name: 'Team/Vertical', type: 'singleSelect' },
            { id: 'fldLocationBase', name: 'Location / Base', type: 'singleLineText' },
            { id: 'fldWorkType', name: 'Work Type', type: 'singleSelect' },
            { id: 'fldRoleType', name: 'Role Type', type: 'singleSelect' },
            { id: 'fldStartDate', name: 'Start Date', type: 'date' },
            { id: 'fldDurationMonths', name: 'Duration (Months)', type: 'number' },
            { id: 'fldDurationCategories', name: 'Duration Categories', type: 'singleSelect' },
            { id: 'fldPurpose', name: 'Displayed Purpose of the Role', type: 'multilineText' },
            { id: 'fldResponsibilities', name: 'Key Responsibilities', type: 'multilineText' },
            { id: 'fldRequiredQualifications', name: '10. Required Qualifications', type: 'multipleSelects' },
            { id: 'fldOtherQualifications', name: 'Other Required Qualifications', type: 'multilineText' },
            { id: 'fldPreferredQualifications', name: 'Preferred Qualifications', type: 'multipleSelects' },
            { id: 'fldAdditionalNotes', name: 'Additional Skill Notes', type: 'multilineText' },
            { id: 'fldTimeCommitment', name: 'Displayed Estimated Time Commitment', type: 'singleLineText' },
            { id: 'fldLanguagesRequired', name: 'Languages Required', type: 'multipleSelects' },
          ],
        },
        {
          id: 'tblPeople123',
          name: 'People',
          fields: [
            { id: 'fldFullName', name: 'Full Name', type: 'singleLineText' },
            { id: 'fldCandidateStatus', name: 'Candidate Status', type: 'singleSelect', options: { choices: [{ name: APPLICANT_STATUS }] } },
            { id: 'fldEmailAddress', name: 'Email Address', type: 'email' },
            { id: 'fldPhone', name: 'Phone Number (incl. Country Code)', type: 'phoneNumber' },
            { id: 'fldLinkedIn', name: 'LinkedIn Profile Link (if available)', type: 'url' },
            { id: 'fldAge', name: 'Age', type: 'singleSelect', options: { choices: PERSON_AGE_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldGender', name: 'Gender', type: 'singleSelect', options: { choices: PERSON_GENDER_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldBirthCountry', name: 'Country of Birth', type: 'singleSelect', options: { choices: COUNTRY_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldLivingCountry', name: 'Country of Living (Current Location)', type: 'singleSelect', options: { choices: COUNTRY_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldJurisdiction', name: 'Jurisdiction', type: 'singleSelect' },
            { id: 'fldEducation', name: 'Academic / Professional Education', type: 'multilineText' },
            { id: 'fldProfession', name: 'Current Profession / Occupation', type: 'multilineText' },
            { id: 'fldJamatiExperience', name: 'Jamati Experience', type: 'multilineText' },
            { id: 'fldNormalizedEmail', name: 'normalized email', type: 'formula' },
          ],
        },
        {
          id: 'tblApps123',
          name: 'Applications',
          fields: [
            { id: 'fldPeople', name: 'People', type: 'multipleRecordLinks' },
            { id: 'fldRoles', name: 'GE Roles', type: 'multipleRecordLinks' },
            { id: 'fldStatus', name: 'Status', type: 'singleSelect', options: { choices: [{ name: APPLICANT_STATUS }, { name: '2 - Interview' }] } },
            { id: 'fldSource', name: 'Source', type: 'singleSelect', options: { choices: [{ name: OPPORTUNITY_BOARD_SOURCE }, { name: 'Referral' }] } },
            { id: 'fldWhy', name: 'Why are you interested in or qualified for this job?', type: 'multilineText' },
            { id: 'fldResume', name: 'CV / Resume', type: 'multipleAttachments' },
            { id: 'fldIdempotency', name: 'Idempotency Key', type: 'singleLineText' },
          ],
        },
      ],
    });

    expect(failures).toEqual([]);
  });

  it('reports missing select options for fields with option parity checks', () => {
    process.env.AIRTABLE_GEROLES_TABLE = 'GE Roles';
    process.env.AIRTABLE_PEOPLE_TABLE = 'People';
    process.env.AIRTABLE_APPLICATIONS_TABLE = 'Applications';

    const failures = compareAirtableSchema({
      tables: [
        {
          id: 'tblPeople',
          name: 'People',
          fields: [
            { id: 'fldFullName', name: 'Full Name', type: 'singleLineText' },
            { id: 'fldCandidateStatus', name: 'Candidate Status', type: 'singleSelect', options: { choices: [{ name: APPLICANT_STATUS }] } },
            { id: 'fldEmailAddress', name: 'Email Address', type: 'email' },
            { id: 'fldPhone', name: 'Phone Number (incl. Country Code)', type: 'phoneNumber' },
            { id: 'fldLinkedIn', name: 'LinkedIn Profile Link (if available)', type: 'url' },
            {
              id: 'fldAge',
              name: 'Age',
              type: 'singleSelect',
              options: { choices: PERSON_AGE_OPTIONS.filter((name) => name !== '35-44').map((name) => ({ name })) },
            },
            { id: 'fldGender', name: 'Gender', type: 'singleSelect', options: { choices: PERSON_GENDER_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldBirthCountry', name: 'Country of Birth', type: 'singleSelect', options: { choices: COUNTRY_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldLivingCountry', name: 'Country of Living (Current Location)', type: 'singleSelect', options: { choices: COUNTRY_OPTIONS.map((name) => ({ name })) } },
            { id: 'fldJurisdiction', name: 'Jurisdiction', type: 'singleSelect' },
            { id: 'fldEducation', name: 'Academic / Professional Education', type: 'multilineText' },
            { id: 'fldProfession', name: 'Current Profession / Occupation', type: 'multilineText' },
            { id: 'fldJamatiExperience', name: 'Jamati Experience', type: 'multilineText' },
            { id: 'fldNormalizedEmail', name: 'normalized email', type: 'formula' },
          ],
        },
        {
          id: 'tblApps',
          name: 'Applications',
          fields: [
            { id: 'fldPeople', name: 'People', type: 'multipleRecordLinks' },
            { id: 'fldRoles', name: 'GE Roles', type: 'multipleRecordLinks' },
            { id: 'fldStatus', name: 'Status', type: 'singleSelect', options: { choices: [{ name: APPLICANT_STATUS }] } },
            { id: 'fldSource', name: 'Source', type: 'singleSelect', options: { choices: [{ name: OPPORTUNITY_BOARD_SOURCE }] } },
            { id: 'fldWhy', name: 'Why are you interested in or qualified for this job?', type: 'multilineText' },
            { id: 'fldResume', name: 'CV / Resume', type: 'multipleAttachments' },
            { id: 'fldIdempotency', name: 'Idempotency Key', type: 'singleLineText' },
          ],
        },
        {
          id: 'tblRoles',
          name: 'GE Roles',
          fields: [
            { id: 'fldRoleTitle', name: 'Role Title', type: 'singleLineText' },
            { id: 'fldDisplayedStatus', name: 'Displayed Status', type: 'singleSelect' },
            { id: 'fldPublished', name: 'Published?', type: 'checkbox' },
            { id: 'fldProgrammeArea', name: 'Programme / Functional Area', type: 'singleSelect' },
            { id: 'fldTeamVertical', name: 'Team/Vertical', type: 'singleSelect' },
            { id: 'fldLocationBase', name: 'Location / Base', type: 'singleLineText' },
            { id: 'fldWorkType', name: 'Work Type', type: 'singleSelect' },
            { id: 'fldRoleType', name: 'Role Type', type: 'singleSelect' },
            { id: 'fldStartDate', name: 'Start Date', type: 'date' },
            { id: 'fldDurationMonths', name: 'Duration (Months)', type: 'number' },
            { id: 'fldDurationCategories', name: 'Duration Categories', type: 'singleSelect' },
            { id: 'fldPurpose', name: 'Displayed Purpose of the Role', type: 'multilineText' },
            { id: 'fldResponsibilities', name: 'Key Responsibilities', type: 'multilineText' },
            { id: 'fldRequiredQualifications', name: '10. Required Qualifications', type: 'multipleSelects' },
            { id: 'fldOtherQualifications', name: 'Other Required Qualifications', type: 'multilineText' },
            { id: 'fldPreferredQualifications', name: 'Preferred Qualifications', type: 'multipleSelects' },
            { id: 'fldAdditionalNotes', name: 'Additional Skill Notes', type: 'multilineText' },
            { id: 'fldTimeCommitment', name: 'Displayed Estimated Time Commitment', type: 'singleLineText' },
            { id: 'fldLanguagesRequired', name: 'Languages Required', type: 'multipleSelects' },
          ],
        },
      ],
    });

    expect(failures).toContain('People.Age: missing Airtable options [35-44].');
  });
});
