import * as Sentry from '@sentry/nextjs';

export type ApplicationStep = 'submit' | 'parse_form' | 'validate' | 'published_roles' | 'person_lookup' | 'idempotency_lookup' | 'country_lookup' | 'person_create' | 'application_create' | 'cv_upload' | 'cv_verify';
const failures = new WeakMap<object, ApplicationStep>();

// Labels are a fixed allowlist. Never use applicant data, keys, filenames or URLs.
export function traceApplicationStep<T>(step: ApplicationStep, work: () => Promise<T>): Promise<T> {
  return Sentry.startSpan({ name: `application.${step}`, op: 'application.step', attributes: { 'application.step': step } }, async span => {
    try {
      return await work();
    } catch (error) {
      span.setStatus({ code: 2, message: 'internal_error' });
      if (error && typeof error === 'object' && !failures.has(error)) failures.set(error, step);
      throw error;
    }
  });
}

export function getApplicationFailureStep(error: unknown) {
  return error && typeof error === 'object' ? failures.get(error) : undefined;
}
