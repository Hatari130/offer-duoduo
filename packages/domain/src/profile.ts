export interface ProfileEducation {
  id: string;
  school: string;
  college?: string;
  major: string;
  degree: string;
  educationDegree?: string;
  educationForm?: string;
  courses?: string;
  researchDirection?: string;
  thesis?: string;
  rank?: string;
  overseasEducation?: string;
  minorMajor?: string;
  advisorName?: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  type?: string;
  department?: string;
  salary?: string;
  startDate: string;
  endDate: string;
  description: string;
  /** Semantic resume content used by templates and AI. `description` remains
   * available for form autofill and backwards compatibility. */
  contentBlocks?: ResumeContentBlock[];
  achievements?: string;
  refereeName?: string;
  refereeTitle?: string;
  refereeContact?: string;
  leavingReason?: string;
  subordinateCount?: string;
  isCurrent?: boolean;
}

export interface ProfileProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  contentBlocks?: ResumeContentBlock[];
  achievement?: string;
  link?: string;
}

export interface ProfileCampusExperience {
  id: string;
  type: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  contentBlocks?: ResumeContentBlock[];
}

export interface ResumeEvidenceLocation {
  source: "pdf" | "docx" | "text" | "manual";
  page?: number;
  startLine?: number;
  endLine?: number;
  sourceText?: string;
  confidence?: number;
}

/**
 * A resume description is not a list of visual lines. These blocks preserve
 * the semantic hierarchy that templates and the tailoring model need.
 */
export interface ResumeContentBlock {
  id: string;
  kind: "paragraph" | "bullet" | "project";
  text?: string;
  label?: string;
  title?: string;
  children?: ResumeContentBlock[];
  evidence?: ResumeEvidenceLocation[];
}

export interface ProfileAward {
  id: string;
  date: string;
  name: string;
  level: string;
  description: string;
}

export interface PersonalProfile {
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  birthDate: string;
  graduationDate: string;
  currentCity: string;
  nativePlace: string;
  height: string;
  weight: string;
  recruitmentType: string;
  graduateStatus: string;
  address: string;
  targetRole: string;
  targetCities: string;
  earliestStartDate: string;
  portfolioUrl: string;
  githubUrl: string;
  education: ProfileEducation[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  campusExperiences: ProfileCampusExperience[];
  awards: ProfileAward[];
  selfIntroduction: string;
  strengths: string;
  careerPlan: string;
  currentResidence?: string;
  nationality?: string;
  idType?: string;
  idNumber?: string;
  studentSource?: string;
  wechat?: string;
  qq?: string;
  politicalStatus?: string;
  maritalStatus?: string;
  healthStatus?: string;
  specialty?: string;
  workYears?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  countryRegion?: string;
  expectedSalary?: string;
  referralCode?: string;
  computerSkills?: Record<string, string>[];
  languages?: Record<string, string>[];
  qualifications?: Record<string, string>[];
  familyMembers?: Record<string, string>[];
  hobbies?: string;
  publications?: Record<string, string>[];
  patents?: Record<string, string>[];
  works?: Record<string, string>[];
  competitions?: Record<string, string>[];
  extraFields?: Record<string, string>;
  updatedAt?: string;
}

export type ProfileFieldKey =
  | keyof PersonalProfile
  | "school"
  | "major"
  | "degree"
  | "gpa"
  | "educationStartDate"
  | "educationEndDate"
  | "experienceOrganization"
  | "experienceTitle"
  | "experienceStartDate"
  | "experienceEndDate"
  | "experienceDescription"
  | "nationality"
  | "idType"
  | "idNumber"
  | "wechat"
  | "qq"
  | "politicalStatus"
  | "maritalStatus"
  | "healthStatus"
  | "specialty"
  | "workYears"
  | "emergencyContactName"
  | "emergencyContactPhone"
  | "countryRegion"
  | "expectedSalary"
  | "educationCollege"
  | "educationDegree"
  | "educationForm"
  | "educationCourses"
  | "educationResearchDirection"
  | "educationThesis"
  | "educationRank"
  | "overseasEducation"
  | "minorMajor"
  | "advisorName"
  | "experienceType"
  | "experienceDepartment"
  | "experienceSalary"
  | "experienceAchievements"
  | "refereeName"
  | "refereeTitle"
  | "refereeContact"
  | "leavingReason"
  | "subordinateCount"
  | "projectName"
  | "projectRole"
  | "projectStartDate"
  | "projectEndDate"
  | "projectDescription"
  | "projectAchievement"
  | "projectLink"
  | "campusExperienceType"
  | "campusExperienceRole"
  | "campusExperienceStartDate"
  | "campusExperienceEndDate"
  | "campusExperienceDescription"
  | "awardDate"
  | "awardName"
  | "awardLevel"
  | "awardDescription"
  | "languageName"
  | "languageCertificate"
  | "englishLevel"
  | "languageScore"
  | "languageProficiency"
  | "listeningSpeaking"
  | "readingWriting"
  | "computerSkillType"
  | "computerSkillProficiency"
  | "qualificationDate"
  | "qualificationName"
  | "qualificationNumber"
  | "qualificationDescription"
  | "familyName"
  | "familyRelation"
  | "familyPhone"
  | "familyCompany"
  | "familyPosition"
  | "familyPoliticalStatus"
  | "publicationDate"
  | "publicationJournal"
  | "publicationLevel"
  | "publicationTitle"
  | "publicationDescription"
  | "publicationAuthors"
  | "publicationImpactFactor"
  | "publicationLink"
  | "patentDate"
  | "patentName"
  | "patentNumber"
  | "patentType"
  | "patentAchievement"
  | "hobbies"
  | "workName"
  | "workLink"
  | "workDescription"
  | "competitionName"
  | "competitionDate"
  | "competitionDescription"
  | "referralCode"
  | "experienceCurrent";
