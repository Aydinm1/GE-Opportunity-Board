import { describe, expect, it } from 'vitest';
import { MAX_APPLICATION_ATTACHMENT_BYTES, MAX_APPLICATION_ATTACHMENT_LABEL } from '../lib/application-constraints';
import { validateApplicationFormData } from '../lib/validation';

function buildApplicationFormData(file: File) {
  const formData = new FormData();
  formData.append('fullName', 'Jane Doe');
  formData.append('emailAddress', 'jane@example.com');
  formData.append('phoneNumber', '+1 555 0100');
  formData.append('age', '25-34');
  formData.append('gender', 'Female');
  formData.append('countryOfOrigin', 'Canada');
  formData.append('countryOfLiving', 'United States');
  formData.append('education', 'Bachelor degree in project management.');
  formData.append('profession', 'Programme manager.');
  formData.append('jamatiExperience', 'Led local initiatives.');
  formData.append('jobId', 'recJob123');
  formData.append('whyText', 'I am well qualified and ready to contribute.');
  formData.append('formStartedAt', '1');
  formData.append('submittedAt', '2500');
  formData.append('cvResume', file);
  return formData;
}

describe('application attachment validation', () => {
  it('accepts resumes up to the configured size limit', async () => {
    const formData = buildApplicationFormData(
      new File([Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES, 0)], 'resume.pdf', { type: 'application/pdf' })
    );

    await expect(validateApplicationFormData(formData)).resolves.toMatchObject({
      attachments: {
        cvResume: {
          filename: 'resume.pdf',
          contentType: 'application/pdf',
        },
      },
    });
  });

  it('rejects resumes larger than the configured size limit', async () => {
    const formData = buildApplicationFormData(
      new File([Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES + 1, 0)], 'resume.pdf', { type: 'application/pdf' })
    );

    await expect(validateApplicationFormData(formData)).rejects.toThrowError(
      `CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`
    );
  });

  it('rejects unsupported select options before the Airtable write path', async () => {
    const formData = buildApplicationFormData(
      new File([Buffer.from('resume')], 'resume.pdf', { type: 'application/pdf' })
    );
    formData.set('age', '35 to 44');

    await expect(validateApplicationFormData(formData)).rejects.toThrowError(
      'We couldn\'t submit your application because one of the selected options is temporarily unavailable. Please refresh the page and try again.'
    );
  });
});
