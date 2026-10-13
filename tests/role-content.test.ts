import { describe, expect, it } from 'vitest';
import { getRoleLocation, normalizeQualificationItems } from '../lib/role-content';
import { asStringArray, splitBullets } from '../lib/utils';

describe('role content formatting', () => {
  it('preserves commas in qualification text, select options, responsibilities and languages', () => {
    const sentence = 'Experience in marketing, communications, or media.';
    expect(asStringArray(sentence + '\n5+ years of experience')).toEqual([sentence, '5+ years of experience']);
    expect(asStringArray(['Leadership, supervision or mentoring experience', '  Communication  '])).toEqual(['Leadership, supervision or mentoring experience', 'Communication']);
    expect(splitBullets('- Planning, tracking and reporting\n- Coordinate teams')).toEqual(['Planning, tracking and reporting', 'Coordinate teams']);
    expect(asStringArray('Fluent English, other languages would be an asset')).toEqual(['Fluent English, other languages would be an asset']);
  });

  it('replaces Other selections with the actual custom qualifications', () => {
    expect(normalizeQualificationItems(['Other (please specify below)'], 'Degree in Marketing, Communications, or Media.\nRelevant experience')).toEqual(['Degree in Marketing, Communications, or Media.', 'Relevant experience']);
  });

  it('hides authoring prompts even when no custom text was supplied', () => {
    expect(normalizeQualificationItems(['Other (please specify below)', 'OTHER (PLEASE SPECIFY BELOW)', 'Relevant experience'])).toEqual(['Relevant experience']);
    expect(normalizeQualificationItems(['Proficiency with digital tools (e.g. MS Office, Google Workspace) Specify below.', 'Experience with specific systems (e.g. Better Impact, Airtable). Specify below.', 'Fluency in more than one language. Specify in Question 15.'])).toEqual(['Proficiency with digital tools (e.g. MS Office, Google Workspace)', 'Experience with specific systems (e.g. Better Impact, Airtable)', 'Fluency in more than one language']);
  });

  it('merges custom details without duplicate bullets', () => {
    expect(normalizeQualificationItems(['Communication', ' '], '- communication\n- Planning')).toEqual(['Communication', 'Planning']);
  });

  it.each([
    ['Remote', undefined, 'Remote', null],
    [' Remote ', 'Remote', 'Remote', null],
    ['Mombasa, Kenya', 'Onsite', 'Mombasa, Kenya', 'Onsite'],
    ['Kenya-based applicants', 'Remote', 'Kenya-based applicants', 'Remote'],
    [null, 'Remote', 'Remote', null],
    ['  ', ' Hybrid ', 'Hybrid', null],
    [null, null, null, null],
  ])('shows location %s with work type %s', (base, workType, value, helper) => {
    expect(getRoleLocation(base, workType)).toEqual({ value, helper });
  });
});
