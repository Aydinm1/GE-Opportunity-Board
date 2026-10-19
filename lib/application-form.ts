import type { Person } from './types';
import { MAX_APPLICATION_ATTACHMENT_BYTES, MAX_APPLICATION_ATTACHMENT_LABEL } from './application-constraints';

export const APPLICATION_WORD_LIMIT = 100;
export type ApplicationField = keyof Person | 'whyText' | 'cvResume';
export type ApplicationFieldErrors = Partial<Record<ApplicationField, string>>;

export const countApplicationWords = (value = '') => value.trim().split(/\s+/).filter(Boolean).length;

export function isLinkedInProfileUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com'));
  } catch {
    return false;
  }
}

const REQUIRED_FIELDS: [keyof Person, string][] = [
  ['fullName', 'Full Name'], ['emailAddress', 'Email'], ['phoneNumber', 'Phone'],
  ['age', 'Age'], ['gender', 'Gender'], ['countryOfOrigin', 'Country of Origin'],
  ['countryOfLiving', 'Current Country'], ['education', 'Academic / Professional Education'],
  ['profession', 'Current Profession / Occupation'], ['jamatiExperience', 'Jamati Experience'],
];

export function getApplicationFieldErrors(person: Person, whyText: string, file: Pick<File, 'size'> | null): ApplicationFieldErrors {
  const errors: ApplicationFieldErrors = {};
  for (const [field, label] of REQUIRED_FIELDS) {
    if (!person[field]?.trim()) errors[field] = `${label} is required.`;
  }
  if (person.emailAddress.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.emailAddress.trim())) errors.emailAddress = 'Enter a valid email address.';
  if (person.linkedIn?.trim() && !isLinkedInProfileUrl(person.linkedIn.trim())) errors.linkedIn = 'Enter a valid LinkedIn URL, or leave this field blank.';
  for (const field of ['education', 'profession', 'jamatiExperience'] as const) {
    if (countApplicationWords(person[field]) > APPLICATION_WORD_LIMIT) errors[field] = `Use ${APPLICATION_WORD_LIMIT} words or fewer.`;
  }
  if (!whyText.trim()) errors.whyText = 'Please explain why this role is a fit for you.';
  else if (countApplicationWords(whyText) > APPLICATION_WORD_LIMIT) errors.whyText = `Use ${APPLICATION_WORD_LIMIT} words or fewer.`;
  if (!file) errors.cvResume = 'Please attach your CV / Resume.';
  else if (file.size > MAX_APPLICATION_ATTACHMENT_BYTES) errors.cvResume = `CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`;
  return errors;
}
