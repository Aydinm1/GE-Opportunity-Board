import { Job } from './types';

export const MOCK_JOBS: Job[] = [
    {
        id: '1',
        roleTitle: 'International Program Lead',
        programmeArea: 'International Program Lead',
        teamVertical: 'Global Encounters',
        locationBase: 'Global Programs Team',
        workType: 'Virtual',
        startDate: 'Oct 2023',
        durationMonths: 12,
        durationCategory: '12 Mo',
        purposeShort: 'We are seeking a passionate Program Lead to oversee our international volunteer initiatives. You will be responsible for coordinating logistics, managing partner relationships, and ensuring the safety and quality of our global programs.',
        keyResponsibilities: [
            'Develop and implement strategic plans for international engagement programs across 3 continents.',
            'Manage a remote team of regional coordinators and provide mentorship.',
            'Monitor program budgets and report on key performance indicators quarterly.'
        ],
        requiredQualifications: [
            "Bachelor's degree in International Relations, Management, or related field.",
            '5+ years of experience in program management, preferably in the non-profit sector.',
            'Fluency in English and Spanish is required; French is a plus.'
        ],
        otherQualifications: null,
        preferredQualifications: [
            'Master\'s degree in relevant field.',
            'Experience with cross-cultural communication in professional settings.'
        ],
        additionalQualifications: null,
        timeCommitment: '40 Hrs/Wk',
        languagesRequired: ['English', 'Spanish', 'French']
    },
    {
        id: '2',
        roleTitle: 'Field Logistics Officer',
        programmeArea: 'Africa Initiatives',
        teamVertical: 'Kenya Operations Team',
        locationBase: 'Nairobi, Kenya',
        workType: 'In-Person',
        startDate: 'Nov 2023',
        durationMonths: 6,
        durationCategory: '6 Mo',
        purposeShort: 'Join our ground operations in Nairobi to streamline supply chain logistics for regional healthcare initiatives.',
        keyResponsibilities: [
            'Coordinate with local vendors for medical supply distribution.',
            'Maintain fleet maintenance records and schedule driver rotations.',
            'Implement safety protocols for field staff in remote regions.'
        ],
        requiredQualifications: [
            'Experience in supply chain management or logistics.',
            'Deep knowledge of the Nairobi metropolitan area.',
            'Valid Kenyan driving license and clean record.'
        ],
        otherQualifications: null,
        preferredQualifications: [
            'Certification in Logistics or Supply Chain.',
            'First Aid certification.'
        ],
        additionalQualifications: null,
        timeCommitment: '20 Hrs/Wk',
        languagesRequired: ['English', 'Swahili']
    },
    {
        id: '3',
        roleTitle: 'Deputy Project Lead',
        programmeArea: 'Global Encounters',
        teamVertical: 'Operations Team',
        locationBase: 'Lisbon, Portugal',
        workType: 'Hybrid',
        startDate: 'Immediate',
        durationMonths: null,
        durationCategory: 'Ongoing',
        purposeShort: 'Support the Project Director in high-level operational strategy and stakeholder engagement for urban development projects.',
        keyResponsibilities: [
            'Draft weekly progress reports for donors and executive leadership.',
            'Manage complex scheduling for multi-stakeholder workshops.',
            'Perform risk assessments for ongoing infrastructure projects.'
        ],
        requiredQualifications: [
            'Proven track record in project management support.',
            'Advanced proficiency in Microsoft Excel and project software.',
            'Excellent written and verbal communication skills.'
        ],
        otherQualifications: null,
        preferredQualifications: [
            'Experience with European urban development grants.',
            'PMP or PRINCE2 certification.'
        ],
        additionalQualifications: null,
        timeCommitment: '15 Hrs/Wk',
        languagesRequired: ['English']
    },
    {
        id: '4',
        roleTitle: 'Regional Health Coordinator',
        programmeArea: 'Southeast Asia Recovery',
        teamVertical: 'Health Initiatives',
        locationBase: 'Bangkok, Thailand',
        workType: 'Virtual',
        startDate: 'Jan 2024',
        durationMonths: 24,
        durationCategory: '24 Mo',
        purposeShort: 'Strategic oversight of public health programs across Southeast Asia, focusing on maternal health and sanitation.',
        keyResponsibilities: [
            'Partner with local NGOs to implement vaccination clinics.',
            'Analyze health data to identify emerging community needs.',
            'Lead cross-border webinars for health professionals.'
        ],
        requiredQualifications: [
            'Master of Public Health (MPH) or equivalent degree.',
            'Experience working in Southeast Asian health systems.',
            'Grant writing experience is highly desirable.'
        ],
        otherQualifications: null,
        preferredQualifications: [
            'Background in epidemiology.',
            'Fluent in at least one regional language.'
        ],
        additionalQualifications: null,
        timeCommitment: '30 Hrs/Wk',
        languagesRequired: ['English', 'Vietnamese', 'Thai']
    }
];
