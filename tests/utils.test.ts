import { describe, expect, it } from 'vitest';
import { splitBullets } from '../lib/utils';

describe('splitBullets', () => {
  it('keeps non-bullet numeric prefixes like 5+ years', () => {
    const input = [
      "Bachelor's degree (or equivalent experience).",
      '',
      '5+ years of experience in programme coordination, logistics, or operations.',
      '',
      'Experience working with children and youth in a developmental or camp setting.',
    ].join('\n');

    expect(splitBullets(input)).toEqual([
      "Bachelor's degree (or equivalent experience).",
      '5+ years of experience in programme coordination, logistics, or operations.',
      'Experience working with children and youth in a developmental or camp setting.',
    ]);
  });

  it('strips list markers for dashed and numbered bullets', () => {
    const input = ['- Lead planning', '1. Coordinate teams', '2) Run retros'].join('\n');

    expect(splitBullets(input)).toEqual([
      'Lead planning',
      'Coordinate teams',
      'Run retros',
    ]);
  });
});
