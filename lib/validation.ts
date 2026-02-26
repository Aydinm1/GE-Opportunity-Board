import { AppError } from './errors';
import type { Person } from '../types';

const WORD_LIMIT = 100;
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
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

type AttachmentInput = { filename: string; contentType: string; base64: string };

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

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1) return '';
  return filename.slice(idx).toLowerCase();
}

function validateAttachment(attachment: unknown): AttachmentInput {
  requireObject(attachment, 'CV / Resume attachment is required.');
  const record = attachment as Record<string, unknown>;
  const filename = requireString(record.filename, 'CV / Resume filename', 255);
  const contentTypeRaw = requireString(record.contentType, 'CV / Resume content type', 255);
  const base64 = requireString(record.base64, 'CV / Resume payload', 20_000_000);
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

  let sizeBytes = 0;
  try {
    sizeBytes = Buffer.byteLength(base64, 'base64');
  } catch {
    throw new AppError('CV / Resume payload is invalid.');
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new AppError('CV / Resume payload is invalid.');
  }
  if (sizeBytes > MAX_ATTACHMENT_BYTES) {
    throw new AppError('CV / Resume must be 5MB or smaller.');
  }

  return { filename, contentType, base64 };
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

export function validateApplicationPayload(payload: unknown) {
  requireObject(payload, 'Invalid application payload.');
  const body = payload as Record<string, unknown>;
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

  requireObject(body.attachments, 'CV / Resume attachment is required.');
  const attachmentsObj = body.attachments as Record<string, unknown>;
  const cvResume = validateAttachment(attachmentsObj.cvResume);

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
    candidateStatus: optionalString(personRaw.candidateStatus, 128) ?? '1a - Applicant',
  };

  const jobId = optionalString(body.jobId, 128) ?? null;
  const jobTitle = optionalString(body.jobTitle, 256) ?? null;
  const extras: Record<string, unknown> = {
    Status: '1a - Applicant',
    Source: 'Opportunity Board',
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
