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

describe('application form accessibility and mobile layout', () => {
  it.each([false, true])('labels every visible field and supplies keyboard/autofill hints (embedded=%s)', isEmbedded => {
    const html = renderToStaticMarkup(<ApplyView job={job} isMobile isEmbedded={isEmbedded} onBackToDetails={() => {}} />);
    const ids = [...html.matchAll(/<label\b[^>]*for="([^"]+)"/g)].map(match => match[1]);
    const fields = [...html.matchAll(/<(input|select|textarea)\b[^>]*>/g)].filter(match => !match[0].includes('name="website"'));
    expect(fields).toHaveLength(13);
    for (const field of fields) {
      const id = field[0].match(/\bid="([^"]+)"/)?.[1];
      expect(id, field[0]).toBeTruthy();
      expect(ids).toContain(id);
    }
    expect(html).toContain('type="tel"');
    expect(html).toContain('autoComplete="tel"');
    expect(html).toContain('autoComplete="name"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('type="url"');
  });

  it.each([false, true])('removes the mobile progress bar and sticky-footer clearance (embedded=%s)', isEmbedded => {
    const html = renderToStaticMarkup(<ApplyView job={job} isMobile isEmbedded={isEmbedded} onBackToDetails={() => {}} />);
    expect(html).not.toContain('progressbar');
    expect(html).not.toContain('transition-[width]');
    expect(html).not.toContain('sticky bottom-0');
    expect(html).not.toContain('pb-24');
  });

  it('retains a labelled scroll indicator in the desktop pane', () => {
    const html = renderToStaticMarkup(<ApplyView job={job} onBackToDetails={() => {}} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Application form scroll position"');
  });
});
