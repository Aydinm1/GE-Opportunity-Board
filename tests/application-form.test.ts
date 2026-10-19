import { describe, expect, it } from 'vitest';
import { countApplicationWords, getApplicationFieldErrors } from '../lib/application-form';
import { MAX_APPLICATION_ATTACHMENT_BYTES } from '../lib/application-constraints';
import type { Person } from '../lib/types';

const person: Person = {
  fullName: 'Test Applicant', emailAddress: 'test@example.com', normalizedEmail: 'test@example.com',
  phoneNumber: '+15550100', age: '25-34', gender: 'female', countryOfOrigin: 'Canada',
  countryOfLiving: 'Canada', education: 'Education', profession: 'Profession', jamatiExperience: 'Experience',
};
const file = { size: 100 };

describe('application field feedback', () => {
  it.each(['fullName', 'emailAddress', 'phoneNumber', 'age', 'gender', 'countryOfOrigin', 'countryOfLiving', 'education', 'profession', 'jamatiExperience'] as const)('identifies missing %s', field => {
    expect(getApplicationFieldErrors({ ...person, [field]: '  ' }, 'Answer', file)[field]).toBeDefined();
  });

  it.each(['education', 'profession', 'jamatiExperience', 'whyText'] as const)('blocks an excessive %s answer without modifying its contents', field => {
    const text = Array.from({ length: 101 }, (_, index) => `word${index}`).join('\n');
    const values = { ...person, [field]: text };
    const errors = getApplicationFieldErrors(values, field === 'whyText' ? text : 'Answer', file);
    expect(errors[field]).toBe('Use 100 words or fewer.');
    expect(values[field]).toBe(text);
    expect(countApplicationWords(text)).toBe(101);
  });

  it('accepts a 100-word multiline answer and a file at the configured limit', () => {
    const answer = Array.from({ length: 100 }, () => 'word').join('\n');
    expect(getApplicationFieldErrors(person, answer, { size: MAX_APPLICATION_ATTACHMENT_BYTES })).toEqual({});
  });

  it('provides picker feedback for missing or oversized CVs', () => {
    expect(getApplicationFieldErrors(person, 'Answer', null).cvResume).toBeDefined();
    expect(getApplicationFieldErrors(person, 'Answer', { size: MAX_APPLICATION_ATTACHMENT_BYTES + 1 }).cvResume).toContain('or smaller');
  });

  it('provides feedback for malformed email and optional LinkedIn values', () => {
    const errors = getApplicationFieldErrors({ ...person, emailAddress: 'invalid', linkedIn: 'Just a name' }, 'Answer', file);
    expect(errors.emailAddress).toBeDefined(); expect(errors.linkedIn).toBeDefined();
    expect(getApplicationFieldErrors({ ...person, linkedIn: '' }, 'Answer', file)).toEqual({});
  });
});
