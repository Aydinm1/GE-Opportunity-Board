import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ApplyView from '../components/ApplyView';
import { AIRTABLE_SCHEMA_CONTRACT } from '../lib/airtable-schema-contract';
import type { Job } from '../lib/types';

const job: Job = {
  id: 'recJob123', roleTitle: 'Test role', programmeArea: null, teamVertical: null,
  locationBase: null, workType: null, roleType: null, startDate: null,
  durationMonths: null, durationCategory: '', purposeShort: null,
  keyResponsibilities: [], requiredQualifications: [], otherQualifications: null,
  preferredQualifications: [], additionalQualifications: null, timeCommitment: null,
  languagesRequired: [],
};

describe('rendered application dropdown contract', () => {
  it.each([
    { isMobile: false, isEmbedded: false },
    { isMobile: true, isEmbedded: false },
    { isMobile: false, isEmbedded: true },
    { isMobile: true, isEmbedded: true },
  ])('maps every visible dropdown to the schema ($isMobile mobile, $isEmbedded embedded)', props => {
    const html = renderToStaticMarkup(<ApplyView job={job} onBackToDetails={() => {}} {...props} />);
    expect(html).toContain('value="female">Female</option>');
    expect(html).toContain('value="male">Male</option>');
    const selects = [...html.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/g)];
    expect(selects).toHaveLength(4);
    const names = ['Age', 'Gender', 'Country of Birth', 'Country of Living (Current Location)'];
    selects.forEach((select, index) => {
      const values = [...select[1].matchAll(/<option\b[^>]*value="([^"]*)"/g)]
        .map(match => match[1].replaceAll('&amp;', '&').replaceAll('&#x27;', "'"))
        .filter(Boolean);
      expect(values).toEqual(AIRTABLE_SCHEMA_CONTRACT.people.fields.find(f => f.name === names[index])?.expectedOptions);
    });
  });
});
