import React, { useEffect, useState, useRef } from 'react';
import { Person, Job } from '../types';
import { useScrollBoundaryTransfer } from '../lib/useScrollBoundaryTransfer';

export interface ApplyDraft {
  person: Person;
  coverLetterFile: File | null;
  whyText: string;
}

interface ApplyViewProps {
  job: Job;
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

const ApplyView: React.FC<ApplyViewProps> = ({ job, onBackToDetails, initialDraft, onDraftChange }) => {
  const [person, setPerson] = useState<Person>(() => initialDraft?.person ? { ...emptyPerson(), ...initialDraft.person } : emptyPerson());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(initialDraft?.coverLetterFile || null);
  const [whyText, setWhyText] = useState(initialDraft?.whyText || '');
  const [website, setWebsite] = useState('');
  const formStartedAtRef = useRef<number>(Date.now());

  const update = (k: keyof Person, v: string) => setPerson((p) => ({ ...p, [k]: v }));

const ageOptions = ['', '13-17', '18-24', '25-34', '35-44', '45-54','55-64','Above 65+',"Prefer not to share"];
  const genderOptions = ['', 'Female', 'Male', 'Non-binary', 'Prefer not to share'];
  const countryOptions = ['',  "Afghanistan",
    "Albania",
    "Algeria",
    "Andorra",
    "Angola",
    "Antigua & Deps",
    "Argentina",
    "Armenia",
    "Australia",
    "Austria",
    "Azerbaijan",
    "Bahamas",
    "Bahrain",
    "Bangladesh",
    "Barbados",
    "Belarus",
    "Belgium",
    "Belize",
    "Benin",
    "Bhutan",
    "Bolivia",
    "Bosnia Herzegovina",
    "Botswana",
    "Brazil",
    "Brunei",
    "Bulgaria",
    "Burkina",
    "Burundi",
    "Cambodia",
    "Cameroon",
    "Canada",
    "Cape Verde",
    "Central African Rep",
    "Chad",
    "Chile",
    "China",
    "Colombia",
    "Comoros",
    "Congo",
    "Congo {Democratic Rep}",
    "Costa Rica",
    "Croatia",
    "Cuba",
    "Cyprus",
    "Czech Republic",
    "Denmark",
    "Djibouti",
    "Dominica",
    "Dominican Republic",
    "East Timor",
    "Ecuador",
    "Egypt",
    "El Salvador",
    "Equatorial Guinea",
    "Eritrea",
    "Estonia",
    "Ethiopia",
    "Fiji",
    "Finland",
    "France",
    "Gabon",
    "Gambia",
    "Georgia",
    "Germany",
    "Ghana",
    "Greece",
    "Grenada",
    "Guatemala",
    "Guinea",
    "Guinea-Bissau",
    "Guyana",
    "Haiti",
    "Honduras",
    "Hungary",
    "Iceland",
    "India",
    "Indonesia",
    "Iran",
    "Iraq",
    "Ireland {Republic}",
    "Israel",
    "Italy",
    "Ivory Coast",
    "Jamaica",
    "Japan",
    "Jordan",
    "Kazakhstan",
    "Kenya",
    "Kiribati",
    "Korea North",
    "Korea South",
    "Kosovo",
    "Kuwait",
    "Kyrgyzstan",
    "Laos",
    "Latvia",
    "Lebanon",
    "Lesotho",
    "Liberia",
    "Libya",
    "Liechtenstein",
    "Lithuania",
    "Luxembourg",
    "Macedonia",
    "Madagascar",
    "Malawi",
    "Malaysia",
    "Maldives",
    "Mali",
    "Malta",
    "Marshall Islands",
    "Mauritania",
    "Mauritius",
    "Mexico",
    "Micronesia",
    "Moldova",
    "Monaco",
    "Mongolia",
    "Montenegro",
    "Morocco",
    "Mozambique",
    "Myanmar, {Burma}",
    "Namibia",
    "Nauru",
    "Nepal",
    "Netherlands",
    "New Zealand",
    "Nicaragua",
    "Niger",
    "Nigeria",
    "Norway",
    "Oman",
    "Pakistan",
    "Palau",
    "Panama",
    "Papua New Guinea",
    "Paraguay",
    "Peru",
    "Philippines",
    "Poland",
    "Portugal",
    "Qatar",
    "Romania",
    "Russian Federation",
    "Rwanda",
    "St Kitts & Nevis",
    "St Lucia",
    "Saint Vincent & the Grenadines",
    "Samoa",
    "San Marino",
    "Sao Tome & Principe",
    "Saudi Arabia",
    "Senegal",
    "Serbia",
    "Seychelles",
    "Sierra Leone",
    "Singapore",
    "Slovakia",
    "Slovenia",
    "Solomon Islands",
    "Somalia",
    "South Africa",
    "South Sudan",
    "Spain",
    "Sri Lanka",
    "Sudan",
    "Suriname",
    "Swaziland",
    "Sweden",
    "Switzerland",
    "Syria",
    "Taiwan",
    "Tajikistan",
    "Tanzania",
    "Thailand",
    "Togo",
    "Tonga",
    "Trinidad & Tobago",
    "Tunisia",
    "Turkey",
    "Turkmenistan",
    "Tuvalu",
    "Uganda",
    "Ukraine",
    "United Arab Emirates",
    "United Kingdom",
    "United States",
    "Uruguay",
    "Uzbekistan",
    "Vanuatu",
    "Vatican City",
    "Venezuela",
    "Vietnam",
    "Yemen",
    "Zambia",
    "Zimbabwe"];

  const WORD_LIMIT = 100; // change this in one place to update all word limits
  const ATTACH_FEEDBACK_MS = 2200; // ms the button shows the 'attached' state
  const countWords = (text = '') => {
    return (text || '').trim().split(/\s+/).filter(Boolean).length;
  };
  const enforceWordLimit = (text = '', limit = WORD_LIMIT) => {
    const words = (text || '').trim().split(/\s+/).filter(Boolean);
    if (words.length <= limit) return text;
    return words.slice(0, limit).join(' ');
  };

  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [justAttached, setJustAttached] = useState(false);
  const attachTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRafRef = useRef<number | null>(null);
  const lastProgressRef = useRef(0);
  useScrollBoundaryTransfer(contentRef);

  useEffect(() => {
    const hydratedPerson = initialDraft?.person ? { ...emptyPerson(), ...initialDraft.person } : emptyPerson();
    setPerson(hydratedPerson);
    setCoverLetterFile(initialDraft?.coverLetterFile || null);
    setWhyText(initialDraft?.whyText || '');
    setError(null);
    setSuccess(null);
    setLoading(false);
    setProgress(0);
    lastProgressRef.current = 0;
    setJustAttached(false);
    setWebsite('');
    formStartedAtRef.current = Date.now();
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [job.id, initialDraft]);

  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({ person, coverLetterFile, whyText });
  }, [person, coverLetterFile, whyText, onDraftChange]);

  useEffect(() => {
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
  }, []);

    useEffect(() => {
      return () => {
        if (attachTimeoutRef.current) clearTimeout(attachTimeoutRef.current);
      };
    }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!person.fullName || !person.emailAddress || !person.phoneNumber || !person.age || !person.gender || !person.countryOfOrigin || !person.countryOfLiving || !person.education || !person.profession || !person.jamatiExperience || !coverLetterFile || !whyText) {
      setError('Please fill all required fields.');
      return;
    }
    setLoading(true);
    try {
      const normalized = person.emailAddress.trim().toLowerCase();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader(); r.onload = () => resolve(typeof r.result === 'string' ? r.result : ''); r.onerror = reject; r.readAsDataURL(coverLetterFile);
      });
      const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!m) throw new Error('Could not read CV / Resume file');
      const [, contentType, base64] = m;
      const attachments = { cvResume: { filename: coverLetterFile.name, contentType, base64 } };
      const payload = {
        person: { ...person, normalizedEmail: normalized, candidateStatus: '1a - Applicant' },
        jobId: job.id,
        extras: { Status: '1a - Applicant', Source: 'Opportunity Board', 'Why are you interested in or qualified for this job?': whyText || '' },
        attachments,
        meta: {
          website,
          formStartedAt: formStartedAtRef.current,
          submittedAt: Date.now(),
        },
      };
      const res = await fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const txt = await res.text(); throw new Error(txt || 'Failed to submit application'); }
      setSuccess('Application submitted. Thank you!');
      setTimeout(() => {
        setLoading(false);
        onDraftChange?.({ person: emptyPerson(), coverLetterFile: null, whyText: '' });
        onBackToDetails();
      }, 900);
    } catch (err: any) { setError(err?.message || 'Submission failed'); setLoading(false); }
  };

  return (
    <div className="h-full min-h-0 flex flex-col bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        <div className="relative px-4 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <button type="button" onClick={onBackToDetails} className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-700 text-sm font-semibold">
              <span className="material-icons-round text-base">arrow_back</span>
              Back
            </button>
            <div className="text-center">
              <h2 className="text-base font-semibold">Apply</h2>
              <div className="text-sm text-primary/90 mt-0.5">{job.roleTitle}</div>
            </div>
            <div className="w-14" />
          </div>
            <div className="mt-3 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-1 bg-primary transition-[width] duration-150 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div ref={contentRef} className="flex-1 overflow-y-scroll p-6" style={{ WebkitOverflowScrolling: 'touch' }}>
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
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Full Name<span className="text-red-600 ml-1">*</span></label>
                  <input required aria-required value={person.fullName} placeholder="Enter your full name" onChange={(e) => update('fullName', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Email<span className="text-red-600 ml-1">*</span></label>
                  <input required aria-required type="email" placeholder="email@example.com" value={person.emailAddress} onChange={(e) => update('emailAddress', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Phone<span className="text-red-600 ml-1">*</span></label>
                  <input required aria-required placeholder="+1 (555) 000-0000" value={person.phoneNumber || ''} onChange={(e) => update('phoneNumber', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Age<span className="text-red-600 ml-1">*</span></label>
                  <select required aria-required value={person.age || ''} onChange={(e) => update('age', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {ageOptions.map((a) => (<option key={a} value={a}>{a || 'Select age range'}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Gender<span className="text-red-600 ml-1">*</span></label>
                  <select required aria-required value={person.gender || ''} onChange={(e) => update('gender', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {genderOptions.map((g) => (<option key={g} value={g}>{g || 'Select gender'}</option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-600 mb-2">LinkedIn Profile</label>
                  <input placeholder="https://linkedin.com/in/username" value={person.linkedIn || ''} onChange={(e) => update('linkedIn', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-600 mb-2">CV / Resume (attachment)<span className="text-red-600 ml-1">*</span></label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold rounded-md shadow-sm ${justAttached ? 'bg-primary text-white border border-primary' : 'bg-white text-primary border border-gray-200 hover:bg-gray-50'} transition-all duration-700 ease-in-out`}
                    >
                      <span className="material-icons-round">{justAttached ? 'check_circle' : 'attach_file'}</span>
                      {justAttached ? 'File attached' : 'Choose File'}
                    </button>

                    <div className="flex items-center gap-2">
                      <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-xs">
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
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt"
                    onChange={(e) => {
                      const f = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                      setCoverLetterFile(f);
                        if (f) {
                        setJustAttached(true);
                        if (attachTimeoutRef.current) clearTimeout(attachTimeoutRef.current);
                        attachTimeoutRef.current = setTimeout(() => setJustAttached(false), ATTACH_FEEDBACK_MS);
                      } else {
                        setJustAttached(false);
                        if (attachTimeoutRef.current) { clearTimeout(attachTimeoutRef.current); attachTimeoutRef.current = null; }
                      }
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Location Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Country of Origin<span className="text-red-600 ml-1">*</span></label>
                  <select required aria-required value={person.countryOfOrigin || ''} onChange={(e) => update('countryOfOrigin', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {countryOptions.map((o) => (<option key={o} value={o}>{o || 'Select country'}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Current Country<span className="text-red-600 ml-1">*</span></label>
                  <select required aria-required value={person.countryOfLiving || ''} onChange={(e) => update('countryOfLiving', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {countryOptions.map((o) => (<option key={o} value={o}>{o || 'Select country'}</option>))}
                  </select>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Experience & Background</h4>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Academic / Professional Education <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea required aria-required placeholder="Academic / Professional Education" value={person.education || ''} onChange={(e) => update('education', enforceWordLimit(e.target.value, WORD_LIMIT))} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <div className="text-xs text-gray-500 mt-1">{countWords(person.education || '')} / {WORD_LIMIT} words</div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Current Profession / Occupation <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea required aria-required placeholder="Profession / Occupation" value={person.profession || ''} onChange={(e) => update('profession', enforceWordLimit(e.target.value, WORD_LIMIT))} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <div className="text-xs text-gray-500 mt-1">{countWords(person.profession || '')} / {WORD_LIMIT} words</div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Jamati Experience <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
                <textarea required aria-required placeholder="Jamati Experience" value={person.jamatiExperience || ''} onChange={(e) => update('jamatiExperience', enforceWordLimit(e.target.value, WORD_LIMIT))} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                <div className="text-xs text-gray-500 mt-1">{countWords(person.jamatiExperience || '')} / {WORD_LIMIT} words</div>
              </div>
            </section>

            

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-600 mb-2">Why are you interested in or qualified for this job? <span className="text-gray-500 text-xs">({WORD_LIMIT} words max)</span><span className="text-red-600 ml-1">*</span></label>
              <textarea required aria-required placeholder="Share why this opportunity is a fit for you" value={whyText} onChange={(e) => setWhyText(enforceWordLimit(e.target.value, WORD_LIMIT))} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <div className="text-xs text-gray-500 mt-1">{countWords(whyText)} / {WORD_LIMIT} words</div>
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            {success && <p className="text-sm text-primary mt-3">{success}</p>}
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t p-4 flex items-center justify-end">
            <button type="submit" disabled={loading} className="px-5 py-3 bg-primary text-white rounded-md shadow text-sm">{loading ? 'Submitting…' : 'Submit Application'}</button>
          </div>
        </form>
    </div>
  );
};

export default ApplyView;
