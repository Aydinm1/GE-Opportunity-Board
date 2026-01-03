export interface Job {
  id: string;
  roleTitle: string;
  programmeArea: string | null;
  teamVertical: string | null;
  locationBase: string | null;
  workType: string | null;
  startDate: string | null;
  durationMonths: number | null;
  durationCategory: string;
  purposeShort: string | null;
  keyResponsibilities: string[];
  requiredQualifications: string[];
  otherQualifications: string | null;
  preferredQualifications: string[];
  additionalQualifications: string | null;
  timeCommitment: string | null;
  languagesRequired: string[];
};

export interface FilterOptions {
    programmeArea: string | null;
    teamVertical: string | null;
    roleType: string;
    startDate: string;
    durationCategory: string;
    timeCommitment: string;
}

export interface Person {
  id?: string; // Airtable record id when present
  fullName: string;
  candidateStatus?: string | null;
  emailAddress: string;
  normalizedEmail?: string;
  phoneNumber?: string | null;
  linkedIn?: string | null;
  age?: string | null;
  gender?: string | null;
  countryOfOrigin?: string | null;
  countryOfLiving?: string | null;
  jurisdiction?: string | null;
  education?: string | null;
  profession?: string | null;
  jamatiExperience?: string | null;
}

export interface Application {
  id?: string; // Airtable record id when present
  personId: string; // linked People record id
  jobId?: string | null;
  coverLetter?: { id: string; url: string }[] | null;
  status?: string | null;
  source?: string | null;
  whyAreYouInterestedInOrQualifiedForThisJob?: string | null;
}
