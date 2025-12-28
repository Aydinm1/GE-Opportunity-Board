import React, { useState } from 'react';
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

  const ageOptions = ['', '<18', '18-24', '25-34', '35-44', '45-54', '55+'];
  const genderOptions = ['', 'Female', 'Male', 'Non-binary', 'Prefer not to say'];
  const countryOptions = ['', 'United States', 'United Kingdom', 'Canada', 'India'];
  const jurisdictionOptions = ['', 'North America', 'South America', 'Europe', 'Africa', 'Asia', 'Oceania', 'Other'];

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
        person: { ...person, normalizedEmail: normalized },
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
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl w-full max-w-4xl mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-bold">Apply — {job.roleTitle}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <h3 className="text-sm font-semibold mb-2">Your details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <input placeholder="Full Name" value={person.fullName} onChange={(e)=>update('fullName', e.target.value)} className="p-2 border rounded" />
            <input placeholder="Email Address" value={person.emailAddress} onChange={(e)=>update('emailAddress', e.target.value)} className="p-2 border rounded" />
            <input placeholder="Phone Number (incl. Country Code)" value={person.phoneNumber||''} onChange={(e)=>update('phoneNumber', e.target.value)} className="p-2 border rounded" />
            <input placeholder="LinkedIn Profile Link" value={person.linkedIn||''} onChange={(e)=>update('linkedIn', e.target.value)} className="p-2 border rounded" />

            <label className="text-xs text-gray-600">Age</label>
            <select value={person.age||''} onChange={(e)=>update('age', e.target.value)} className="p-2 border rounded">
              {ageOptions.map((o)=> (<option key={o} value={o}>{o || 'Select age'}</option>))}
            </select>

            <label className="text-xs text-gray-600">Gender</label>
            <select value={person.gender||''} onChange={(e)=>update('gender', e.target.value)} className="p-2 border rounded">
              {genderOptions.map((o)=> (<option key={o} value={o}>{o || 'Select gender'}</option>))}
            </select>

            <label className="text-xs text-gray-600">Country of Origin</label>
            <select value={person.countryOfOrigin||''} onChange={(e)=>update('countryOfOrigin', e.target.value)} className="p-2 border rounded">
              {countryOptions.map((o)=> (<option key={o} value={o}>{o || 'Select country'}</option>))}
            </select>

            <label className="text-xs text-gray-600">Country of Living (Current Location)</label>
            <select value={person.countryOfLiving||''} onChange={(e)=>update('countryOfLiving', e.target.value)} className="p-2 border rounded">
              {countryOptions.map((o)=> (<option key={o} value={o}>{o || 'Select country'}</option>))}
            </select>

            <label className="text-xs text-gray-600">Jurisdiction</label>
            <select value={person.jurisdiction||''} onChange={(e)=>update('jurisdiction', e.target.value)} className="p-2 border rounded">
              {jurisdictionOptions.map((o)=> (<option key={o} value={o}>{o || 'Select jurisdiction'}</option>))}
            </select>

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

          <div className="flex items-center gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded bg-primary text-white" disabled={loading}>
              {loading ? 'Submitting...' : 'Submit'}
            </button>
          </div>

          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {success && <p className="text-sm text-green-600 mt-3">{success}</p>}
        </form>
      </div>
    </div>
  );
};

export default ApplyModal;
