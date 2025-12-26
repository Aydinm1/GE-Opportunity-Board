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
  preferredQualifications: string[];
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