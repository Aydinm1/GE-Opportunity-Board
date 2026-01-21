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

  const update = (k: keyof Person, v: string) => {
    setPerson((p) => ({ ...p, [k]: v }));
  };

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

  // Prevent background scroll while modal is open
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Scroll progress for the modal content
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const pct = Math.max(0, Math.min(1, scrollTop / (scrollHeight - clientHeight || 1)));
      setProgress(pct);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [contentRef.current]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!person.emailAddress || !person.fullName) {
      setError('Please enter your full name and email.');
      return;
    }
    if (!coverLetterFile) {
      setError('Please attach your CV / Resume file.');
      return;
    }

    setLoading(true);
    try {
      const normalized = person.emailAddress.trim().toLowerCase();
      // Build extras for application record: include status, source, cover letter and long answer.
      const extras: Record<string, unknown> = {};
      // Include status and source (use Airtable field names)
      extras['Status'] = '1a - Applicant';
      extras['Source'] = 'Opportunity Board';

      // Long answer question (include multiple key variants)
      if (whyText && whyText.trim() !== '') {
        extras['Why are you interested in or qualified for this job?'] = whyText.trim();
      }

      // Encode attachment and pass to backend for Airtable content upload
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
        r.onerror = reject;
        r.readAsDataURL(coverLetterFile);
      });
      const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!m) throw new Error('Could not read CV / Resume file');
      const [, contentType, base64] = m;

      const attachments = {
        cvResume: {
          filename: coverLetterFile.name,
          contentType,
          base64,
        },
      };

      const payload = {
        person: { ...person, normalizedEmail: normalized, candidateStatus: '1a - Applicant' },
        jobId: job.id,
        extras,
        attachments,
      };

      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to submit application');
      }

      const data = await res.json();
      setSuccess('Application submitted. Thank you!');
      // Optionally, you could keep modal open to continue with rest of application.
      setTimeout(() => {
        setLoading(false);
        onClose();
      }, 900);
    } catch (err: any) {
      setError(err?.message || 'Submission failed');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="relative bg-white dark:bg-gray-900 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 w-8 text-left">✕</button>
            <div className="text-center">
              <h2 className="text-base font-semibold">Apply</h2>
              <div className="text-sm text-primary/90 mt-0.5">{job.roleTitle}</div>
            </div>
            <div className="w-8" />
          </div>
          {/* progress bar */}
          <div className="mt-3 h-1 w-full bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div className="h-1 bg-primary transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-widest mb-3 px-6 pt-4">Your details</h3>
          <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Full Name</label>
                <input placeholder="Enter your full name" value={person.fullName} onChange={(e)=>update('fullName', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                <input placeholder="email@example.com" value={person.emailAddress} onChange={(e)=>update('emailAddress', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Phone Number</label>
                <input placeholder="+1 (555) 000-0000" value={person.phoneNumber||''} onChange={(e)=>update('phoneNumber', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">LinkedIn Profile</label>
                <input placeholder="https://linkedin.com/in/username" value={person.linkedIn||''} onChange={(e)=>update('linkedIn', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Age Range</label>
                <select value={person.age||''} onChange={(e)=>update('age', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {ageOptions.map((o)=> (<option key={o} value={o}>{o || 'Select age range'}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Gender</label>
                <select value={person.gender||''} onChange={(e)=>update('gender', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {genderOptions.map((o)=> (<option key={o} value={o}>{o || 'Select gender'}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Country of Origin</label>
                <select value={person.countryOfOrigin||''} onChange={(e)=>update('countryOfOrigin', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {countryOptions.map((o)=> (<option key={o} value={o}>{o || 'Select country'}</option>))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Current Country</label>
                <select value={person.countryOfLiving||''} onChange={(e)=>update('countryOfLiving', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {countryOptions.map((o)=> (<option key={o} value={o}>{o || 'Select country'}</option>))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Jurisdiction</label>
                <select value={person.jurisdiction||''} onChange={(e)=>update('jurisdiction', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/20">
                  {jurisdictionOptions.map((o)=> (<option key={o} value={o}>{o || 'Select jurisdiction'}</option>))}
                </select>
              </div>

            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Academic / Professional Education</label>
              <textarea placeholder="Academic / Professional Education" value={person.education||''} onChange={(e)=>update('education', e.target.value)} className="w-full p-2 border rounded h-24" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Profession / Occupation</label>
              <textarea placeholder="Profession / Occupation" value={person.profession||''} onChange={(e)=>update('profession', e.target.value)} className="w-full p-2 border rounded h-24" />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Jamati Experience</label>
              <textarea placeholder="Jamati Experience" value={person.jamatiExperience||''} onChange={(e)=>update('jamatiExperience', e.target.value)} className="w-full p-2 border rounded h-24" />
            </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">CV / Resume (attachment)</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt"
              onChange={(e) => setCoverLetterFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)}
              className="w-full p-2 border rounded mb-2"
              required
            />
          </div>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1">Why are you interested in or qualified for this job?</label>
              <textarea
                placeholder="Share why this opportunity is a fit for you"
                value={whyText}
                onChange={(e) => setWhyText(e.target.value)}
                className="w-full p-2 border rounded h-28"
              />
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            {success && <p className="text-sm text-primary mt-3">{success}</p>}

          </div>

          {/* Sticky footer with big submit button */}
          <div className="p-5 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="max-w-full mx-auto">
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="flex-1 px-4 py-3 rounded-lg border">Cancel</button>
                <button type="submit" className="flex-1 bg-primary text-white px-4 py-3 rounded-lg font-bold shadow-lg flex items-center justify-center gap-2" disabled={loading}>
                  <span>{loading ? 'Submitting...' : 'Submit Application'}</span>
                  <span className="material-icons-round">send</span>
                </button>
              </div>
            </div>
          </div>

        </form>
      </div>
    </div>
    );
  };

  export default ApplyModal;
