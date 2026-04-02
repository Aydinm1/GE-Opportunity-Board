import { AppError } from './errors';
import {
  MAX_APPLICATION_ATTACHMENT_BASE64_CHARS,
  MAX_APPLICATION_ATTACHMENT_BYTES,
  MAX_APPLICATION_ATTACHMENT_LABEL,
} from './application-constraints';
import {
  APPLICANT_STATUS,
  OPPORTUNITY_BOARD_SOURCE,
  PERSON_SELECT_ALLOWLISTS,
} from './application-select-options';
import type { Person } from '../types';

const WORD_LIMIT = 100;
const WHY_FIELD = 'Why are you interested in or qualified for this job?';
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.txt']);
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);
const FRIENDLY_SELECT_OPTION_ERROR = 'We couldn\'t submit your application because one of the selected options is temporarily unavailable. Please refresh the page and try again.';

export type AttachmentInput = { filename: string; contentType: string; bytes: Uint8Array };

function sanitizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(CONTROL_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function requireObject(value: unknown, message: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(message);
  }
}

function requireString(value: unknown, fieldName: string, maxLength = 512): string {
  if (typeof value !== 'string') throw new AppError(`${fieldName} is required.`);
  const trimmed = sanitizeText(value);
  if (!trimmed) throw new AppError(`${fieldName} is required.`);
  if (trimmed.length > maxLength) throw new AppError(`${fieldName} is too long.`);
  return trimmed;
}

function optionalString(value: unknown, maxLength = 512): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = sanitizeText(value);
  if (!trimmed) return undefined;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function requireAllowedOption(value: string, options: readonly string[]) {
  if (!options.includes(value)) {
    throw new AppError(FRIENDLY_SELECT_OPTION_ERROR, {
      status: 400,
      code: 'INVALID_SELECT_OPTION',
    });
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function enforceWordLimit(value: string, fieldName: string) {
  if (countWords(value) > WORD_LIMIT) {
    throw new AppError(`${fieldName} must be ${WORD_LIMIT} words or fewer.`);
  }
}

function validateEmail(email: string): string {
  const normalized = sanitizeText(email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new AppError('Email format is invalid.');
  }
  return normalized;
}

function normalizeContentType(value: string): string {
  return value.toLowerCase().split(';')[0].trim();
}

function coerceFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx).toLowerCase();
}

function validateAttachmentMetadata(filenameValue: unknown, contentTypeValue: unknown) {
  const filename = requireString(filenameValue, 'CV / Resume filename', 255);
  const contentTypeRaw = requireString(contentTypeValue, 'CV / Resume content type', 255);
  if (filename.includes('/') || filename.includes('\\')) {
    throw new AppError('CV / Resume filename is invalid.');
  }

  const extension = getExtension(filename);
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new AppError('CV / Resume file type is not allowed.');
  }

  const contentType = normalizeContentType(contentTypeRaw);
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new AppError('CV / Resume content type is not allowed.');
  }

  return { filename, contentType };
}

function validateAttachmentBytes(filename: string, contentType: string, bytesValue: unknown): AttachmentInput {
  let bytes: Uint8Array;

  if (bytesValue instanceof Uint8Array) {
    bytes = bytesValue;
  } else if (bytesValue instanceof ArrayBuffer) {
    bytes = new Uint8Array(bytesValue);
  } else if (ArrayBuffer.isView(bytesValue)) {
    bytes = new Uint8Array(bytesValue.buffer, bytesValue.byteOffset, bytesValue.byteLength);
  } else {
    throw new AppError('CV / Resume payload is invalid.');
  }

  const sizeBytes = bytes.byteLength;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new AppError('CV / Resume payload is invalid.');
  }
  if (sizeBytes > MAX_APPLICATION_ATTACHMENT_BYTES) {
    throw new AppError(`CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`);
  }

  return { filename, contentType, bytes };
}

function validateAttachment(attachment: unknown): AttachmentInput {
  requireObject(attachment, 'CV / Resume attachment is required.');
  const record = attachment as Record<string, unknown>;
  const { filename, contentType } = validateAttachmentMetadata(record.filename, record.contentType);

  if (typeof record.base64 === 'string') {
    const base64 = requireString(record.base64, 'CV / Resume payload', MAX_APPLICATION_ATTACHMENT_BASE64_CHARS);
    let sizeBytes = 0;
    try {
      sizeBytes = Buffer.byteLength(base64, 'base64');
    } catch {
      throw new AppError('CV / Resume payload is invalid.');
    }
    if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
      throw new AppError('CV / Resume payload is invalid.');
    }
    if (sizeBytes > MAX_APPLICATION_ATTACHMENT_BYTES) {
      throw new AppError(`CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`);
    }
    return validateAttachmentBytes(filename, contentType, Buffer.from(base64, 'base64'));
  }

  return validateAttachmentBytes(filename, contentType, record.bytes);
}

async function validateUploadedFile(fileValue: FormDataEntryValue | null): Promise<AttachmentInput> {
  if (!(fileValue instanceof File)) {
    throw new AppError('CV / Resume attachment is required.');
  }

  const { filename, contentType } = validateAttachmentMetadata(fileValue.name, fileValue.type);
  if (!Number.isFinite(fileValue.size) || fileValue.size <= 0) {
    throw new AppError('CV / Resume payload is invalid.');
  }
  if (fileValue.size > MAX_APPLICATION_ATTACHMENT_BYTES) {
    throw new AppError(`CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`);
  }

  return validateAttachmentBytes(filename, contentType, await fileValue.arrayBuffer());
}

function validateBotMeta(payload: Record<string, unknown>) {
  const meta = payload.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;
  const m = meta as Record<string, unknown>;

  if (typeof m.website === 'string' && m.website.trim() !== '') {
    throw new AppError('Automated submission detected.');
  }

  if (typeof m.formStartedAt === 'number' && typeof m.submittedAt === 'number') {
    const elapsedMs = m.submittedAt - m.formStartedAt;
    if (elapsedMs >= 0 && elapsedMs < 1500) {
      throw new AppError('Please wait a moment before submitting.');
    }
  }
}

function validateApplicationBody(body: Record<string, unknown>, cvResume: AttachmentInput) {
  validateBotMeta(body);

  requireObject(body.person, 'Person details are required.');
  const personRaw = body.person as Record<string, unknown>;

  const fullName = requireString(personRaw.fullName, 'Full Name', 160);
  const emailAddress = requireString(personRaw.emailAddress, 'Email', 320);
  const normalizedEmail = validateEmail(emailAddress);
  const phoneNumber = requireString(personRaw.phoneNumber, 'Phone', 64);
  const age = requireString(personRaw.age, 'Age', 32);
  const gender = requireString(personRaw.gender, 'Gender', 64);
  const countryOfOrigin = requireString(personRaw.countryOfOrigin, 'Country of Origin', 120);
  const countryOfLiving = requireString(personRaw.countryOfLiving, 'Current Country', 120);
  requireAllowedOption(age, PERSON_SELECT_ALLOWLISTS.age);
  requireAllowedOption(gender, PERSON_SELECT_ALLOWLISTS.gender);
  requireAllowedOption(countryOfOrigin, PERSON_SELECT_ALLOWLISTS.countryOfOrigin);
  requireAllowedOption(countryOfLiving, PERSON_SELECT_ALLOWLISTS.countryOfLiving);
  const education = requireString(personRaw.education, 'Academic / Professional Education', 4000);
  const profession = requireString(personRaw.profession, 'Current Profession / Occupation', 4000);
  const jamatiExperience = requireString(personRaw.jamatiExperience, 'Jamati Experience', 4000);

  enforceWordLimit(education, 'Academic / Professional Education');
  enforceWordLimit(profession, 'Current Profession / Occupation');
  enforceWordLimit(jamatiExperience, 'Jamati Experience');

  const extrasRaw = body.extras;
  requireObject(extrasRaw, 'Application details are required.');
  const extrasObj = extrasRaw as Record<string, unknown>;
  const whyText = requireString(extrasObj[WHY_FIELD], WHY_FIELD, 4000);
  enforceWordLimit(whyText, WHY_FIELD);

  const person: Person = {
    fullName,
    emailAddress,
    normalizedEmail,
    phoneNumber,
    age,
    gender,
    countryOfOrigin,
    countryOfLiving,
    education,
    profession,
    jamatiExperience,
    linkedIn: optionalString(personRaw.linkedIn, 512),
    candidateStatus: optionalString(personRaw.candidateStatus, 128) ?? APPLICANT_STATUS,
  };

  const jobId = optionalString(body.jobId, 128) ?? null;
  const jobTitle = optionalString(body.jobTitle, 256) ?? null;
  const extras: Record<string, unknown> = {
    Status: APPLICANT_STATUS,
    Source: OPPORTUNITY_BOARD_SOURCE,
    [WHY_FIELD]: whyText,
  };

  return {
    person,
    jobId,
    jobTitle,
    extras,
    attachments: { cvResume },
  };
}

export function validateApplicationPayload(payload: unknown) {
  requireObject(payload, 'Invalid application payload.');
  const body = payload as Record<string, unknown>;
  requireObject(body.attachments, 'CV / Resume attachment is required.');
  const attachmentsObj = body.attachments as Record<string, unknown>;
  const cvResume = validateAttachment(attachmentsObj.cvResume);
  return validateApplicationBody(body, cvResume);
}

function readFormText(formData: FormData, fieldName: string): string | undefined {
  const value = formData.get(fieldName);
  return typeof value === 'string' ? value : undefined;
}

export async function validateApplicationFormData(formData: FormData) {
  const body: Record<string, unknown> = {
    person: {
      fullName: readFormText(formData, 'fullName'),
      emailAddress: readFormText(formData, 'emailAddress'),
      phoneNumber: readFormText(formData, 'phoneNumber'),
      linkedIn: readFormText(formData, 'linkedIn'),
      age: readFormText(formData, 'age'),
      gender: readFormText(formData, 'gender'),
      countryOfOrigin: readFormText(formData, 'countryOfOrigin'),
      countryOfLiving: readFormText(formData, 'countryOfLiving'),
      education: readFormText(formData, 'education'),
      profession: readFormText(formData, 'profession'),
      jamatiExperience: readFormText(formData, 'jamatiExperience'),
    },
    jobId: readFormText(formData, 'jobId'),
    jobTitle: readFormText(formData, 'jobTitle'),
    extras: {
      [WHY_FIELD]: readFormText(formData, 'whyText'),
    },
    meta: {
      website: readFormText(formData, 'website'),
      idempotencyKey: readFormText(formData, 'idempotencyKey'),
      formStartedAt: coerceFiniteNumber(readFormText(formData, 'formStartedAt')),
      submittedAt: coerceFiniteNumber(readFormText(formData, 'submittedAt')),
    },
  };

  const cvResume = await validateUploadedFile(formData.get('cvResume'));
  return validateApplicationBody(body, cvResume);
}

export function validateIdempotencyKey(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new AppError('Idempotency key must be a string.', { status: 400 });
  }
  const key = sanitizeText(value);
  if (!key) return null;
  if (!SAFE_IDEMPOTENCY_KEY.test(key)) {
    throw new AppError('Idempotency key format is invalid.', { status: 400 });
  }
  return key;
}
