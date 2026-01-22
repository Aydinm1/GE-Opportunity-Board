import React, { useEffect, useState, useRef } from 'react';
import { Person, Job } from '../types';

interface ApplyModalProps {
  job: Job;
  onClose: () => void;
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
  jurisdiction: '',
  education: '',
  profession: '',
  jamatiExperience: '',
  candidateStatus: ''
});

const ApplyModal: React.FC<ApplyModalProps> = ({ job, onClose }) => {
  const [person, setPerson] = useState<Person>(emptyPerson());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [coverLetterFile, setCoverLetterFile] = useState<File | null>(null);
  const [whyText, setWhyText] = useState('');

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
  const jurisdictionOptions = [
    "",
    "Afghanistan",
    "Australia / New Zealand",
    "Bangladesh",
    "Far East",
    "France",
    "Madagascar",
    "Mozambique",
    "Pakistan",
    "Portugal",
    "Russia",
    "Syria",
    "Tajikistan",
    "Tanzania",
    "UAE",
    "Uganda",
    "UK ",
    "USA",
    "Iran",
    "Germany",
    "Canada",
    "United Arab Emirates",
    "United Kingdom",
    "DR Congo",
    "India",
    "Kenya",
    "Angola",
    "Southeast Asia"
]

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const denom = scrollHeight - clientHeight;
      const pct = denom <= 0 ? 1 : Math.max(0, Math.min(1, scrollTop / denom));
      setProgress(pct);
    };

    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);

    // Keep progress updated if content size changes
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(onScroll);
      try { ro.observe(el); } catch (e) { /* ignore */ }
    }

    onScroll();
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (ro) ro.disconnect();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!person.fullName || !person.emailAddress) { setError('Please enter your full name and email.'); return; }
    if (!coverLetterFile) { setError('Please attach your CV / Resume file.'); return; }
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
      const payload = { person: { ...person, normalizedEmail: normalized, candidateStatus: '1a - Applicant' }, jobId: job.id, extras: { Status: '1a - Applicant', Source: 'Opportunity Board', 'Why are you interested in or qualified for this job?': whyText || '' }, attachments };
      const res = await fetch('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) { const txt = await res.text(); throw new Error(txt || 'Failed to submit application'); }
      setSuccess('Application submitted. Thank you!');
      setTimeout(() => { setLoading(false); onClose(); }, 900);
    } catch (err: any) { setError(err?.message || 'Submission failed'); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-md shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        <div className="relative px-4 pt-4 pb-3 border-b">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-gray-500 w-8">✕</button>
            <div className="text-center">
              <h2 className="text-base font-semibold">Apply</h2>
              <div className="text-sm text-primary/90 mt-0.5">{job.roleTitle}</div>
            </div>
            <div className="w-8" />
          </div>
          <div className="mt-3 h-1 w-full bg-gray-100 rounded-full overflow-hidden">
            <div className="h-1 bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Full Name</label>
                  <input placeholder="Enter your full name" value={person.fullName} onChange={(e) => update('fullName', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Email</label>
                  <input placeholder="email@example.com" value={person.emailAddress} onChange={(e) => update('emailAddress', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Phone</label>
                  <input placeholder="+1 (555) 000-0000" value={person.phoneNumber || ''} onChange={(e) => update('phoneNumber', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Age</label>
                  <select value={person.age || ''} onChange={(e) => update('age', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {ageOptions.map((a) => (<option key={a} value={a}>{a || 'Select age range'}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Gender</label>
                  <select value={person.gender || ''} onChange={(e) => update('gender', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {genderOptions.map((g) => (<option key={g} value={g}>{g || 'Select gender'}</option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-600 mb-2">LinkedIn Profile</label>
                  <input placeholder="https://linkedin.com/in/username" value={person.linkedIn || ''} onChange={(e) => update('linkedIn', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Location Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Country of Origin</label>
                  <select value={person.countryOfOrigin || ''} onChange={(e) => update('countryOfOrigin', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {countryOptions.map((o) => (<option key={o} value={o}>{o || 'Select country'}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Current Country</label>
                  <select value={person.countryOfLiving || ''} onChange={(e) => update('countryOfLiving', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {countryOptions.map((o) => (<option key={o} value={o}>{o || 'Select country'}</option>))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-600 mb-2">Jurisdiction</label>
                  <select value={person.jurisdiction || ''} onChange={(e) => update('jurisdiction', e.target.value)} className="w-full px-4 py-3 border border-gray-200 rounded-md bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20">
                    {jurisdictionOptions.map((o) => (<option key={o} value={o}>{o || 'Select jurisdiction'}</option>))}
                  </select>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h4 className="text-xs font-bold uppercase tracking-widest mb-3">Experience & Background</h4>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Academic / Professional Education</label>
                <textarea placeholder="Academic / Professional Education" value={person.education || ''} onChange={(e) => update('education', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Profession / Occupation</label>
                <textarea placeholder="Profession / Occupation" value={person.profession || ''} onChange={(e) => update('profession', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-600 mb-2">Jamati Experience</label>
                <textarea placeholder="Jamati Experience" value={person.jamatiExperience || ''} onChange={(e) => update('jamatiExperience', e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>
            </section>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-600 mb-2">CV / Resume (attachment)</label>
              <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => setCoverLetterFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)} className="w-full p-3 border border-gray-200 rounded-md bg-white shadow-sm" />
            </div>

            <div className="mb-8">
              <label className="block text-sm font-semibold text-gray-600 mb-2">Why are you interested in or qualified for this job?</label>
              <textarea placeholder="Share why this opportunity is a fit for you" value={whyText} onChange={(e) => setWhyText(e.target.value)} className="w-full p-4 border border-gray-200 rounded-md h-28 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            {success && <p className="text-sm text-primary mt-3">{success}</p>}
          </div>

          <div className="sticky bottom-0 bg-white dark:bg-gray-900 border-t p-4 flex items-center justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-md bg-gray-100 text-sm text-gray-700 mr-3">Cancel</button>
            <button type="submit" disabled={loading} className="px-5 py-3 bg-primary text-white rounded-md shadow text-sm">{loading ? 'Submitting…' : 'Submit Application'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApplyModal;
