import { describe, expect, it } from 'vitest';
import { MAX_APPLICATION_ATTACHMENT_BYTES, MAX_APPLICATION_ATTACHMENT_LABEL } from '../lib/application-constraints';
import { validateApplicationPayload } from '../lib/validation';

const WHY_FIELD = 'Why are you interested in or qualified for this job?';

function validApplicationPayload(base64: string) {
  return {
    person: {
      fullName: 'Jane Doe',
      emailAddress: 'jane@example.com',
      phoneNumber: '+1 555 0100',
      age: '25-34',
      gender: 'Female',
      countryOfOrigin: 'Canada',
      countryOfLiving: 'United States',
      education: 'Bachelor degree in project management.',
      profession: 'Programme manager.',
      jamatiExperience: 'Led local initiatives.',
    },
    jobId: 'recJob123',
    extras: {
      [WHY_FIELD]: 'I am well qualified and ready to contribute.',
    },
    attachments: {
      cvResume: {
        filename: 'resume.pdf',
        contentType: 'application/pdf',
        base64,
      },
    },
  };
}

describe('application attachment validation', () => {
  it('accepts resumes up to 10MB', () => {
    const base64 = Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES, 0).toString('base64');

    expect(() => validateApplicationPayload(validApplicationPayload(base64))).not.toThrow();
  });

  it('rejects resumes larger than 10MB', () => {
    const base64 = Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES + 1, 0).toString('base64');

    expect(() => validateApplicationPayload(validApplicationPayload(base64))).toThrowError(
      `CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`
    );
  });
});
