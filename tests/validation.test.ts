import { describe, expect, it } from 'vitest';
import { MAX_APPLICATION_ATTACHMENT_BYTES, MAX_APPLICATION_ATTACHMENT_LABEL } from '../lib/application-constraints';
import { validateApplicationFormData } from '../lib/validation';

function buildApplicationFormData(file: File) {
  const formData = new FormData();
  formData.append('fullName', 'Jane Doe');
  formData.append('emailAddress', 'jane@example.com');
  formData.append('phoneNumber', '+1 555 0100');
  formData.append('age', '25-34');
  formData.append('gender', 'female');
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
  it('accepts the Airtable-cased gender option values', async () => {
    const formData = buildApplicationFormData(
      new File([Buffer.from('%PDF-1.7 resume')], 'resume.pdf', { type: 'application/pdf' })
    );
    formData.set('gender', 'Non-Binary');

    await expect(validateApplicationFormData(formData)).resolves.toMatchObject({
      person: {
        gender: 'Non-Binary',
      },
    });
  });

  it('accepts resumes up to the configured size limit', async () => {
    expect(MAX_APPLICATION_ATTACHMENT_BYTES).toBe(4 * 1024 * 1024);
    const formData = buildApplicationFormData(
      new File([Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES - 5)])], 'resume.pdf', { type: 'application/pdf' })
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

  it('leaves room for the form and multipart encoding at the file limit', async () => {
    const form = buildApplicationFormData(new File(
      [Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(MAX_APPLICATION_ATTACHMENT_BYTES - 5)])],
      'resume.pdf', { type: 'application/pdf' }
    ));
    // Long UTF-8 answers and profile values exercise multipart overhead too.
    for (const name of ['education', 'profession', 'jamatiExperience', 'whyText']) form.set(name, '界'.repeat(4000));
    form.set('fullName', '界'.repeat(160));
    await expect(validateApplicationFormData(form)).resolves.toBeDefined();
    const encoded = await new Request('http://localhost/api/applications', { method: 'POST', body: form }).arrayBuffer();
    expect(encoded.byteLength).toBeLessThan(4_500_000);
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
      new File([Buffer.from('%PDF-1.7 resume')], 'resume.pdf', { type: 'application/pdf' })
    );
    formData.set('age', '35 to 44');

    await expect(validateApplicationFormData(formData)).rejects.toThrowError(
      'We couldn\'t submit your application because one of the selected options is temporarily unavailable. Please refresh the page and try again.'
    );
  });
});

describe('CV file format checks', () => {
  it.each([0x80, 0x85, 0x9f])('rejects UTF-8 encoded C1 control U+%s in TXT resumes', async codePoint => {
    const file = new File([`Experience${String.fromCodePoint(codePoint)}more text`], 'resume.txt', { type: 'text/plain' });
    await expect(validateApplicationFormData(buildApplicationFormData(file))).rejects.toThrow(
      'CV / Resume text files must contain UTF-8 text without binary control characters.'
    );
  });

  it.each([
    ['resume.pdf', 'application/pdf', Buffer.from('%PDF-1.7\n')],
    ['resume.doc', 'application/msword', Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])],
    ['resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from([0x50, 0x4b, 0x03, 0x04])],
    ['resume.txt', 'text/plain', Buffer.from('Résumé\nExperience\t2026')],
  ])('accepts matching contents for %s', async (name, type, bytes) => {
    await expect(validateApplicationFormData(buildApplicationFormData(new File([bytes], name, { type })))).resolves.toBeDefined();
  });

  it.each([
    ['resume.pdf', 'application/pdf', Buffer.from('not a PDF')],
    ['resume.doc', 'application/msword', Buffer.from('%PDF-1.7')],
    ['resume.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', Buffer.from('PK')],
    ['resume.txt', 'text/plain', Buffer.from([0, 1, 2])],
    ['resume.txt', 'text/plain', Buffer.from([0xff, 0xfe])],
    ['resume.pdf', 'application/pdf', Buffer.alloc(0)],
    ['resume.pdf', 'application/msword', Buffer.from('%PDF-1.7')],
  ])('rejects invalid contents or metadata for %s', async (name, type, bytes) => {
    await expect(validateApplicationFormData(buildApplicationFormData(new File([bytes], name, { type })))).rejects.toThrow();
  });

  it.each(['', 'invalid', 'recABC/123', "recABC'", 'recABC '.repeat(30)])('rejects missing or malformed role ID %s', async jobId => {
    const form = buildApplicationFormData(new File(['%PDF-1.7'], 'resume.pdf', { type: 'application/pdf' }));
    form.set('jobId', jobId);
    await expect(validateApplicationFormData(form)).rejects.toThrow();
  });
});
