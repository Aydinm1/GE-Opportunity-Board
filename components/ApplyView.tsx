import React, { useEffect, useState, useRef, useId } from 'react';
import { Person, Job } from '../lib/types';
import { COUNTRY_OPTIONS, PERSON_AGE_OPTIONS, PERSON_GENDER_OPTIONS, PERSON_GENDER_LABELS } from '../lib/application-select-options';
import { MAX_APPLICATION_ATTACHMENT_BYTES, MAX_APPLICATION_ATTACHMENT_LABEL } from '../lib/application-constraints';
import { captureClientException } from '../lib/monitoring';
import { requestIframeResize } from '../lib/request-iframe-resize';
import { useScrollBoundaryTransfer } from '../lib/useScrollBoundaryTransfer';
import { parseErrorResponseMessage } from '../lib/utils';
import { APPLICATION_WORD_LIMIT, countApplicationWords, getApplicationFieldErrors, type ApplicationField, type ApplicationFieldErrors } from '../lib/application-form';

export interface ApplyDraft {
  person: Person;
  coverLetterFile: File | null;
  whyText: string;
  submissionKey?: string;
}

interface ApplyViewProps {
  job: Job;
  isEmbedded?: boolean;
  isMobile?: boolean;
  onBackToDetails: () => void;
  initialDraft?: ApplyDraft;
  onDraftChange?: (draft: ApplyDraft) => void;
}

const emptyPerson = (): Person => ({
  fullName: '',
  emailAddress: '',
  normalizedEmail: '',
  phoneNumber: '',
  linkedIn: '',
  age: '',
  gender: '',
  countryOfOrigin: '',
  countryOfLiving: '',
  education: '',
  profession: '',
  jamatiExperience: '',
  candidateStatus: ''
});

const createSubmissionKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const ATTACHMENT_SIZE_ERROR = `CV / Resume must be ${MAX_APPLICATION_ATTACHMENT_LABEL} or smaller.`;

type SubmitRequestError = Error & {
  endpoint?: string;
  status?: number;
};

function getFileExtension(name: string) {
  const idx = name.lastIndexOf('.');
  return idx === -1 ? '' : name.slice(idx).toLowerCase();
}

const ApplyView: React.FC<ApplyViewProps> = ({ job, isEmbedded = false, isMobile = false, onBackToDetails, initialDraft, onDraftChange }) => {
  const [person, setPerson] = useState<Person>(() => initialDraft?.person ? { ...emptyPerson(), ...initialDraft.person } : emptyPerson());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ApplicationFieldErrors>({});
  const fieldPrefix = useId();
  const errorSummaryRef = useRef<HTMLParagraphElement | null>(null);
  const fileButtonRef = useRef<HTMLButtonElement | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(initialDraft?.coverLetterFile || null);
  const [whyText, setWhyText] = useState(initialDraft?.whyText || '');
  const [submissionKey, setSubmissionKey] = useState<string>(() => initialDraft?.submissionKey || createSubmissionKey());
  const [website, setWebsite] = useState('');
  const inFlightSubmitRef = useRef(false);
  const formStartedAtRef = useRef<number>(Date.now());
  const pageHideCountRef = useRef(0);
  const visibilityChangeCountRef = useRef(0);
  const lastVisibilityStateRef = useRef<string>(
    typeof document !== 'undefined' ? document.visibilityState : 'unknown'
  );

  const WORD_LIMIT = APPLICATION_WORD_LIMIT;
  const ATTACH_FEEDBACK_MS = 2200;
  const countWords = countApplicationWords;
  const fieldId = (field: ApplicationField) => `${fieldPrefix}-${field}`;
  const clearFieldError = (field: ApplicationField) => setFieldErrors(previous => {
    if (!previous[field]) return previous;
    const next = { ...previous }; delete next[field]; return next;
  });
  const update = (field: keyof Person, value: string) => {
    setPerson(previous => ({ ...previous, [field]: value }));
    clearFieldError(field);
  };
  const longAnswers = { education: person.education, profession: person.profession, jamatiExperience: person.jamatiExperience, whyText };
  const fieldMessage = (field: ApplicationField) => {
    if (field in longAnswers && countWords(longAnswers[field as keyof typeof longAnswers]) > WORD_LIMIT) return `Use ${WORD_LIMIT} words or fewer.`;
    return fieldErrors[field];
  };
  const fieldProps = (field: ApplicationField) => ({
    id: fieldId(field), name: field,
    'aria-invalid': Boolean(fieldMessage(field)),
    'aria-describedby': [
      field in longAnswers ? `${fieldId(field)}-counter` : null,
      field === 'cvResume' ? `${fieldId(field)}-help` : null,
      fieldMessage(field) ? `${fieldId(field)}-error` : null,
    ].filter(Boolean).join(' ') || undefined,
  });
  const renderFieldError = (field: ApplicationField) => fieldMessage(field) ? (
    <p id={`${fieldId(field)}-error`} role={field === 'cvResume' ? 'alert' : undefined} className="mt-2 text-sm text-red-600">{fieldMessage(field)}</p>
  ) : null;
  const renderWordCounter = (field: keyof typeof longAnswers) => (
    <div id={`${fieldId(field)}-counter`} className={`text-xs mt-1 ${countWords(longAnswers[field]) > WORD_LIMIT ? 'text-red-600' : 'text-gray-500'}`}>
      {countWords(longAnswers[field])} / {WORD_LIMIT} words
    </div>
  );
  const focusField = (field: ApplicationField) => window.requestAnimationFrame(() => {
    const control = field === 'cvResume' ? fileButtonRef.current : document.getElementById(fieldId(field));
    control?.focus({ preventScroll: true });
    control?.scrollIntoView({ block: 'center' });
  });

  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [justAttached, setJustAttached] = useState(false);
  const attachTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef<number | null>(null);
  const lastProgressRef = useRef(0);
  const usesFormPaneLayout = !isMobile;
  useScrollBoundaryTransfer(contentRef, !isMobile && !isEmbedded);

  useEffect(() => {
    const hydratedPerson = initialDraft?.person ? { ...emptyPerson(), ...initialDraft.person } : emptyPerson();
    setPerson(hydratedPerson);
    setCoverLetterFile(initialDraft?.coverLetterFile || null);
    setWhyText(initialDraft?.whyText || '');
    setError(null);
    setFieldErrors({});
    setSuccess(null);
    setLoading(false);
    inFlightSubmitRef.current = false;
    setProgress(0);
    lastProgressRef.current = 0;
    setJustAttached(false);
    setSubmissionKey(initialDraft?.submissionKey || createSubmissionKey());
    setWebsite('');
    formStartedAtRef.current = Date.now();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [job.id, initialDraft]);

  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({ person, coverLetterFile, whyText, submissionKey });
  }, [person, coverLetterFile, whyText, submissionKey, onDraftChange]);

  useEffect(() => {
    if (!isEmbedded || typeof window === 'undefined') return;

    requestIframeResize();
    const frameId = window.requestAnimationFrame(requestIframeResize);
    const timeoutId = window.setTimeout(requestIframeResize, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [coverLetterFile, error, isEmbedded, job.id, success]);

  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const handleVisibilityChange = () => {
      visibilityChangeCountRef.current += 1;
      lastVisibilityStateRef.current = document.visibilityState;
    };
    const handlePageHide = () => {
      pageHideCountRef.current += 1;
      lastVisibilityStateRef.current = document.visibilityState;
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const el = contentRef.current;
    if (!el) return;
    const updateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const denom = scrollHeight - clientHeight;
      const pct = denom <= 0 ? 1 : Math.max(0, Math.min(1, scrollTop / denom));
      if (Math.abs(pct - lastProgressRef.current) < 0.005 && pct !== 0 && pct !== 1) return;
      lastProgressRef.current = pct;
      setProgress(pct);
    };
    const scheduleProgressUpdate = () => {
      if (progressRafRef.current !== null) return;
      progressRafRef.current = window.requestAnimationFrame(() => {
        progressRafRef.current = null;
        updateProgress();
      });
    };

    el.addEventListener('scroll', scheduleProgressUpdate, { passive: true });
    window.addEventListener('resize', scheduleProgressUpdate);

    // Keep progress updated if content size changes
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(scheduleProgressUpdate);
      try { ro.observe(el); } catch (e) { /* ignore */ }
    }

    scheduleProgressUpdate();
    return () => {
      el.removeEventListener('scroll', scheduleProgressUpdate);
      window.removeEventListener('resize', scheduleProgressUpdate);
      if (ro) ro.disconnect();
      if (progressRafRef.current !== null) {
        window.cancelAnimationFrame(progressRafRef.current);
        progressRafRef.current = null;
      }
    };
  }, [isMobile]);

  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => {
      errorSummaryRef.current?.focus({ preventScroll: true });
      errorSummaryRef.current?.scrollIntoView({ block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error]);

    useEffect(() => {
      return () => {
        if (attachTimeoutRef.current) clearTimeout(attachTimeoutRef.current);
      };
    }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightSubmitRef.current || loading) return;
    setError(null);
    setSuccess(null);
    const errors = getApplicationFieldErrors(person, whyText, coverLetterFile);
    if (!coverLetterFile && fieldErrors.cvResume) errors.cvResume = fieldErrors.cvResume;
    setFieldErrors(errors);
    const firstError = Object.keys(errors)[0] as ApplicationField | undefined;
    if (firstError) {
      focusField(firstError);
      return;
    }
    inFlightSubmitRef.current = true;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('fullName', person.fullName);
      formData.append('emailAddress', person.emailAddress);
      formData.append('phoneNumber', person.phoneNumber || '');
      formData.append('linkedIn', person.linkedIn || '');
      formData.append('age', person.age || '');
      formData.append('gender', person.gender || '');
      formData.append('countryOfOrigin', person.countryOfOrigin || '');
      formData.append('countryOfLiving', person.countryOfLiving || '');
      formData.append('education', person.education || '');
      formData.append('profession', person.profession || '');
      formData.append('jamatiExperience', person.jamatiExperience || '');
      formData.append('jobId', job.id);
      formData.append('whyText', whyText);
      formData.append('website', website);
      formData.append('idempotencyKey', submissionKey);
      formData.append('formStartedAt', String(formStartedAtRef.current));
      formData.append('submittedAt', String(Date.now()));
      formData.append('cvResume', coverLetterFile);
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'x-idempotency-key': submissionKey },
        body: formData,
      });
      if (!res.ok) {
        const txt = await res.text();
        const requestError = new Error(parseErrorResponseMessage(txt, 'Failed to submit application')) as SubmitRequestError;
        requestError.endpoint = '/api/applications';
        requestError.status = res.status;
        throw requestError;
      }
      setSuccess('Application submitted. Thank you!');
      const nextSubmissionKey = createSubmissionKey();
      setSubmissionKey(nextSubmissionKey);
      setTimeout(() => {
        setLoading(false);
        inFlightSubmitRef.current = false;
        onDraftChange?.({ person: emptyPerson(), coverLetterFile: null, whyText: '', submissionKey: nextSubmissionKey });
        onBackToDetails();
      }, 900);
    } catch (err: any) {
      const requestError = err as SubmitRequestError;
      if (
        err instanceof TypeError ||
        (typeof requestError?.status === 'number' && requestError.status >= 500)
      ) {
        const currentLocation = typeof window !== 'undefined' ? window.location : null;
        const currentNavigator = typeof navigator !== 'undefined' ? navigator : null;
        captureClientException(err, {
          endpoint: requestError.endpoint || '/api/applications',
          jobId: job.id,
          operation: 'submit_application',
          status: requestError.status,
          isEmbedded,
          isMobile,
          pagePath: currentLocation?.pathname || '',
          pageSearch: currentLocation?.search || '',
          navigatorOnline: currentNavigator?.onLine ?? null,
          visibilityState: typeof document !== 'undefined' ? document.visibilityState : lastVisibilityStateRef.current,
          lastVisibilityState: lastVisibilityStateRef.current,
          pageHideCount: pageHideCountRef.current,
          visibilityChangeCount: visibilityChangeCountRef.current,
          submitElapsedMs: Date.now() - formStartedAtRef.current,
          uploadBytes: coverLetterFile?.size ?? null,
          uploadMimeType: coverLetterFile?.type || '',
          uploadExtension: coverLetterFile ? getFileExtension(coverLetterFile.name) : '',
        });
      }
      const message = err?.message || 'Submission failed';
      if (message.startsWith('CV / Resume')) {
        setFieldErrors(previous => ({ ...previous, cvResume: message }));
        focusField('cvResume');
      } else {
        setError(message);
      }
      setLoading(false);
      inFlightSubmitRef.current = false;
    }
  };

  return (
    <div className={`flex flex-col min-h-0 bg-white dark:bg-gray-900 ${usesFormPaneLayout ? 'h-full overflow-hidden' : 'overflow-visible'} ${isMobile ? '' : 'rounded-xl border border-gray-100 shadow-sm dark:border-gray-800'}`}>
        <div className={`relative border-b px-4 pt-4 pb-3 ${isMobile ? '' : 'sm:px-6'}`}>
          <div className="sm:hidden">
            <button
              type="button"
              onClick={onBackToDetails}
              className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm font-semibold"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
          </div>
          <div className="mt-3 sm:mt-0 sm:relative sm:flex sm:items-center sm:justify-center sm:min-h-10">
            <button
              type="button"
              onClick={onBackToDetails}
              className="hidden sm:inline-flex absolute left-0 items-center gap-1 text-gray-500 hover:text-gray-700 text-sm font-semibold"
            >
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
            <div className="sm:text-center sm:px-12">
              <h2 className="text-base font-semibold">Apply</h2>
              <div className="mt-0.5 text-sm leading-snug text-primary/90 sm:line-clamp-2">{job.roleTitle}</div>
            </div>
          </div>
          {!isMobile && (
            <div role="progressbar" aria-label="Application form scroll position" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="mt-3 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-1 bg-primary transition-[width] duration-150 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <form noValidate onSubmit={handleSubmit} className={`${usesFormPaneLayout ? 'flex-1 flex flex-col overflow-hidden' : 'flex flex-col overflow-visible'}`}>
          <div ref={contentRef} className={`${usesFormPaneLayout ? 'flex-1 overflow-y-scroll' : 'overflow-visible'} px-4 pb-6 pt-5 sm:p-6`} style={{ WebkitOverflowScrolling: 'touch' }}>
            {error && <p ref={errorSummaryRef} role="alert" tabIndex={-1} className="mb-5 text-sm text-red-600">{error}</p>}
            <div className="hidden" aria-hidden="true">
              <label htmlFor="website-field">Website</label>
              <input
                id="website-field"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>
            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label htmlFor={fieldId('fullName')} className="block text-sm font-semibold text-gray-600 mb-2">Full Name<span className="text-red-600 ml-1">*</span></label>
                  <input {...fieldProps('fullName')} required aria-required autoComplete="name" value={person.fullName} placeholder="Enter your full name" onChange={(e) => update('fullName', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {renderFieldError('fullName')}
                </div>
                <div>
                  <label htmlFor={fieldId('emailAddress')} className="block text-sm font-semibold text-gray-600 mb-2">Email<span className="text-red-600 ml-1">*</span></label>
                  <input {...fieldProps('emailAddress')} required aria-required type="email" autoComplete="email" placeholder="email@example.com" value={person.emailAddress} onChange={(e) => update('emailAddress', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {renderFieldError('emailAddress')}
                </div>
                <div>
                  <label htmlFor={fieldId('phoneNumber')} className="block text-sm font-semibold text-gray-600 mb-2">Phone<span className="text-red-600 ml-1">*</span></label>
                  <input {...fieldProps('phoneNumber')} required aria-required type="tel" inputMode="tel" autoComplete="tel" placeholder="+1 (555) 000-0000" value={person.phoneNumber || ''} onChange={(e) => update('phoneNumber', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {renderFieldError('phoneNumber')}
                </div>
                <div>
                  <label htmlFor={fieldId('age')} className="block text-sm font-semibold text-gray-600 mb-2">Age<span className="text-red-600 ml-1">*</span></label>
                  <select {...fieldProps('age')} required aria-required value={person.age || ''} onChange={(e) => update('age', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">Select age range</option>
                    {PERSON_AGE_OPTIONS.map((a) => (<option key={a} value={a}>{a}</option>))}
                  </select>
                  {renderFieldError('age')}
                </div>
                <div>
                  <label htmlFor={fieldId('gender')} className="block text-sm font-semibold text-gray-600 mb-2">Gender<span className="text-red-600 ml-1">*</span></label>
                  <select {...fieldProps('gender')} required aria-required value={person.gender || ''} onChange={(e) => update('gender', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">Select gender</option>
                    {PERSON_GENDER_OPTIONS.map((g) => (<option key={g} value={g}>{PERSON_GENDER_LABELS[g]}</option>))}
                  </select>
                  {renderFieldError('gender')}
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={fieldId('linkedIn')} className="block text-sm font-semibold text-gray-600 mb-2">LinkedIn Profile</label>
                  <input {...fieldProps('linkedIn')} type="url" autoComplete="url" placeholder="https://linkedin.com/in/username" value={person.linkedIn || ''} onChange={(e) => update('linkedIn', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {renderFieldError('linkedIn')}
                </div>
                <div className="md:col-span-2">
                  <label htmlFor={fieldId('cvResume')} className="block text-sm font-semibold text-gray-600 mb-2">CV / Resume (attachment)<span className="text-red-600 ml-1">*</span></label>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      ref={fileButtonRef}
                      aria-describedby={fieldProps('cvResume')['aria-describedby']}
                      aria-invalid={Boolean(fieldMessage('cvResume'))}
                      onClick={() => fileInputRef.current?.click()}
                      className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-md shadow-sm ${justAttached ? 'bg-primary text-white border border-primary' : 'bg-white text-primary border border-gray-200 hover:bg-gray-50'} transition-all duration-700 ease-in-out`}
                    >
                      <span className="material-icons-round">{justAttached ? 'check_circle' : 'attach_file'}</span>
                      {justAttached ? 'File attached' : 'Choose File'}
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-full sm:max-w-xs">
                        {coverLetterFile ? coverLetterFile.name : 'No file chosen'}
                      </div>
                      {coverLetterFile && (
                        <button
                          type="button"
                          aria-label="Remove attached file"
                          onClick={() => {
                            setCoverLetterFile(null);
                            setJustAttached(false);
                            if (attachTimeoutRef.current) { clearTimeout(attachTimeoutRef.current); attachTimeoutRef.current = null; }
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border"
                        >
                          <span className="material-icons-round text-base">close</span>
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    {...fieldProps('cvResume')}
                    ref={fileInputRef}
                    aria-required
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                      if (f && f.size > MAX_APPLICATION_ATTACHMENT_BYTES) {
                        setCoverLetterFile(null);
                        setJustAttached(false);
                        setFieldErrors(previous => ({ ...previous, cvResume: ATTACHMENT_SIZE_ERROR }));
                        focusField('cvResume');
                        if (attachTimeoutRef.current) { clearTimeout(attachTimeoutRef.current); attachTimeoutRef.current = null; }
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        return;
                      }
                      setCoverLetterFile(f);
                      clearFieldError('cvResume');
                      if (f) {
                        setJustAttached(true);
                        if (attachTimeoutRef.current) clearTimeout(attachTimeoutRef.current);
                        attachTimeoutRef.current = setTimeout(() => setJustAttached(false), ATTACH_FEEDBACK_MS);
                      } else {
                        setJustAttached(false);
                        if (attachTimeoutRef.current) { clearTimeout(attachTimeoutRef.current); attachTimeoutRef.current = null; }
                      }
                    }}
                    className="sr-only"
                    tabIndex={-1}
                  />
                  {renderFieldError('cvResume')}
                  <p id={`${fieldId('cvResume')}-help`} className="mt-2 text-xs text-gray-500">Accepted: PDF, DOC, DOCX, TXT up to {MAX_APPLICATION_ATTACHMENT_LABEL}. If your file is larger, re-exporting as PDF usually reduces the size.</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Location Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor={fieldId('countryOfOrigin')} className="block text-sm font-semibold text-gray-600 mb-2">Country of Origin<span className="text-red-600 ml-1">*</span></label>
                  <select {...fieldProps('countryOfOrigin')} required aria-required value={person.countryOfOrigin || ''} onChange={(e) => update('countryOfOrigin', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">Select country</option>
                    {COUNTRY_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                  {renderFieldError('countryOfOrigin')}
                </div>
                <div>
                  <label htmlFor={fieldId('countryOfLiving')} className="block text-sm font-semibold text-gray-600 mb-2">Current Country<span className="text-red-600 ml-1">*</span></label>
                  <select {...fieldProps('countryOfLiving')} required aria-required value={person.countryOfLiving || ''} onChange={(e) => update('countryOfLiving', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    <option value="">Select current country</option>
                    {COUNTRY_OPTIONS.map((o) => (<option key={o} value={o}>{o}</option>))}
                  </select>
                  {renderFieldError('countryOfLiving')}
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Experience & Background</h4>
              <div className="mb-6">
                <label htmlFor={fieldId('education')} className="block text-sm font-semibold text-gray-600 mb-2">Academic / Professional Education <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea {...fieldProps('education')} required aria-required placeholder="Academic / Professional Education" value={person.education || ''} onChange={(e) => update('education', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                {renderFieldError('education')}
                {renderWordCounter('education')}
              </div>
              <div className="mb-6">
                <label htmlFor={fieldId('profession')} className="block text-sm font-semibold text-gray-600 mb-2">Current Profession / Occupation <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea {...fieldProps('profession')} required aria-required placeholder="Profession / Occupation" value={person.profession || ''} onChange={(e) => update('profession', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                {renderFieldError('profession')}
                {renderWordCounter('profession')}
              </div>
              <div className="mb-6">
                <label htmlFor={fieldId('jamatiExperience')} className="block text-sm font-semibold text-gray-600 mb-2">Jamati Experience <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea {...fieldProps('jamatiExperience')} required aria-required placeholder="Jamati Experience" value={person.jamatiExperience || ''} onChange={(e) => update('jamatiExperience', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                {renderFieldError('jamatiExperience')}
                {renderWordCounter('jamatiExperience')}
              </div>
            </section>

            

            <div className="mb-8">
              <label htmlFor={fieldId('whyText')} className="block text-sm font-semibold text-gray-600 mb-2">Why are you interested in or qualified for this role? <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
              <textarea {...fieldProps('whyText')} required aria-required placeholder="Share why this opportunity is a fit for you" value={whyText} onChange={(e) => { setWhyText(e.target.value); clearFieldError('whyText'); }} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  {renderFieldError('whyText')}
              {renderWordCounter('whyText')}
            </div>

            {success && <p role="status" className="text-sm text-primary mt-3">{success}</p>}
          </div>

          <div className={`${usesFormPaneLayout ? 'sticky bottom-0' : ''} border-t bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] dark:bg-gray-900 flex items-center justify-stretch sm:justify-end`}>
            <button type="submit" disabled={loading} className="w-full sm:w-auto px-5 py-3 bg-primary text-white rounded-md shadow text-sm">{loading ? 'Submitting…' : 'Submit Application'}</button>
          </div>
        </form>
    </div>
  );
};

export default ApplyView;
