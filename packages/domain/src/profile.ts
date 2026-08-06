export interface ProfileEducation {
  id: string;
  school: string;
  college: string;
  major: string;
  degree: string;
  educationDegree: string;
  educationForm: string;
  courses: string;
  researchDirection: string;
  thesis: string;
  rank: string;
  overseasEducation: string;
  minorMajor: string;
  advisorName: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  type: string;
  department: string;
  salary: string;
  startDate: string;
  endDate: string;
  description: string;
  achievements: string;
  refereeName: string;
  refereeTitle: string;
  refereeContact: string;
  leavingReason: string;
  subordinateCount: string;
  isCurrent: boolean;
}

export interface ProfileProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
  achievement: string;
  link: string;
}

export interface ProfileCampusExperience {
  id: string;
  type: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProfileAward {
  id: string;
  date: string;
  name: string;
  level: string;
  description: string;
}

export interface ProfileLanguage {
  id: string;
  name: string;
  certificate: string;
  englishLevel: string;
  score: string;
  proficiency: string;
  listeningSpeaking: string;
  readingWriting: string;
}

export interface ProfileComputerSkill {
  id: string;
  type: string;
  proficiency: string;
}

export interface ProfileQualification {
  id: string;
  date: string;
  name: string;
  number: string;
  description: string;
}

export interface ProfileFamilyMember {
  id: string;
  name: string;
  relation: string;
  phone: string;
  company: string;
  position: string;
  politicalStatus: string;
}

export interface ProfilePublication {
  id: string;
  date: string;
  journal: string;
  level: string;
  title: string;
  description: string;
  authors: string;
  impactFactor: string;
  link: string;
}

export interface ProfilePatent {
  id: string;
  date: string;
  name: string;
  number: string;
  type: string;
  achievement: string;
}

export interface ProfileWork {
  id: string;
  name: string;
  link: string;
  description: string;
}

export interface ProfileCompetition {
  id: string;
  name: string;
  date: string;
  description: string;
}

export interface PersonalProfile {
  fullName: string;
  gender: string;
  phone: string;
  email: string;
  nationality: string;
  idType: string;
  idNumber: string;
  birthDate: string;
  graduationDate: string;
  currentCity: string;
  nativePlace: string;
  studentSource: string;
  currentResidence: string;
  height: string;
  weight: string;
  recruitmentType: string;
  graduateStatus: string;
  wechat: string;
  qq: string;
  politicalStatus: string;
  maritalStatus: string;
  healthStatus: string;
  specialty: string;
  workYears: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  countryRegion: string;
  address: string;
  targetRole: string;
  targetCities: string;
  earliestStartDate: string;
  expectedSalary: string;
  referralCode: string;
  portfolioUrl: string;
  githubUrl: string;
  education: ProfileEducation[];
  experiences: ProfileExperience[];
  projects: ProfileProject[];
  campusExperiences: ProfileCampusExperience[];
  awards: ProfileAward[];
  languages: ProfileLanguage[];
  computerSkills: ProfileComputerSkill[];
  qualifications: ProfileQualification[];
  familyMembers: ProfileFamilyMember[];
  publications: ProfilePublication[];
  patents: ProfilePatent[];
  works: ProfileWork[];
  competitions: ProfileCompetition[];
  hobbies: string;
  selfIntroduction: string;
  strengths: string;
  careerPlan: string;
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
  | "studentSource"
  | "currentResidence"
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

/**
 * Flatten the local profile into the canonical keys used by form rules.
 * Repeatable sections are addressed by repeatIndex so the same mapping works
 * for education, work, project and the extended resume sections.
 */
export function getProfileFieldValues(
  profile: PersonalProfile,
  repeatIndex = 0
): Record<string, string> {
  const index = Number.isInteger(repeatIndex) && repeatIndex >= 0 ? repeatIndex : 0;
  const education = profile.education?.[index];
  const experience = profile.experiences?.[index];
  const project = profile.projects?.[index];
  const campusExperience = profile.campusExperiences?.[index];
  const award = profile.awards?.[index];
  const language = profile.languages?.[index];
  const computerSkill = profile.computerSkills?.[index];
  const qualification = profile.qualifications?.[index];
  const family = profile.familyMembers?.[index];
  const publication = profile.publications?.[index];
  const patent = profile.patents?.[index];
  const work = profile.works?.[index];
  const competition = profile.competitions?.[index];

  return {
    fullName: profile.fullName || "",
    gender: profile.gender || "",
    phone: profile.phone || "",
    email: profile.email || "",
    nationality: profile.nationality || "",
    idType: profile.idType || "",
    idNumber: profile.idNumber || "",
    birthDate: profile.birthDate || "",
    graduationDate: profile.graduationDate || "",
    currentCity: profile.currentCity || "",
    nativePlace: profile.nativePlace || "",
    studentSource: profile.studentSource || "",
    currentResidence: profile.currentResidence || "",
    height: profile.height || "",
    weight: profile.weight || "",
    recruitmentType: profile.recruitmentType || "",
    graduateStatus: profile.graduateStatus || "",
    wechat: profile.wechat || "",
    qq: profile.qq || "",
    politicalStatus: profile.politicalStatus || "",
    maritalStatus: profile.maritalStatus || "",
    healthStatus: profile.healthStatus || "",
    specialty: profile.specialty || "",
    workYears: profile.workYears || "",
    emergencyContactName: profile.emergencyContactName || "",
    emergencyContactPhone: profile.emergencyContactPhone || "",
    countryRegion: profile.countryRegion || "",
    address: profile.address || "",
    targetRole: profile.targetRole || "",
    targetCities: profile.targetCities || "",
    earliestStartDate: profile.earliestStartDate || "",
    expectedSalary: profile.expectedSalary || "",
    referralCode: profile.referralCode || "",
    portfolioUrl: profile.portfolioUrl || "",
    githubUrl: profile.githubUrl || "",
    school: education?.school || "",
    major: education?.major || "",
    degree: education?.degree || "",
    gpa: education?.gpa || "",
    educationStartDate: education?.startDate || "",
    educationEndDate: education?.endDate || "",
    educationCollege: education?.college || "",
    educationDegree: education?.educationDegree || "",
    educationForm: education?.educationForm || "",
    educationCourses: education?.courses || "",
    educationResearchDirection: education?.researchDirection || "",
    educationThesis: education?.thesis || "",
    educationRank: education?.rank || "",
    overseasEducation: education?.overseasEducation || "",
    minorMajor: education?.minorMajor || "",
    advisorName: education?.advisorName || "",
    experienceOrganization: experience?.organization || "",
    experienceTitle: experience?.title || "",
    experienceStartDate: experience?.startDate || "",
    experienceEndDate: experience?.endDate || "",
    experienceDescription: experience?.description || "",
    experienceType: experience?.type || "",
    experienceDepartment: experience?.department || "",
    experienceSalary: experience?.salary || "",
    experienceAchievements: experience?.achievements || "",
    refereeName: experience?.refereeName || "",
    refereeTitle: experience?.refereeTitle || "",
    refereeContact: experience?.refereeContact || "",
    leavingReason: experience?.leavingReason || "",
    subordinateCount: experience?.subordinateCount || "",
    experienceCurrent: experience?.isCurrent ? "至今" : "",
    projectName: project?.name || "",
    projectRole: project?.role || "",
    projectStartDate: project?.startDate || "",
    projectEndDate: project?.endDate || "",
    projectDescription: project?.description || "",
    projectAchievement: project?.achievement || "",
    projectLink: project?.link || "",
    campusExperienceType: campusExperience?.type || "",
    campusExperienceRole: campusExperience?.role || "",
    campusExperienceStartDate: campusExperience?.startDate || "",
    campusExperienceEndDate: campusExperience?.endDate || "",
    campusExperienceDescription: campusExperience?.description || "",
    awardDate: award?.date || "",
    awardName: award?.name || "",
    awardLevel: award?.level || "",
    awardDescription: award?.description || "",
    languageName: language?.name || "",
    languageCertificate: language?.certificate || "",
    englishLevel: language?.englishLevel || "",
    languageScore: language?.score || "",
    languageProficiency: language?.proficiency || "",
    listeningSpeaking: language?.listeningSpeaking || "",
    readingWriting: language?.readingWriting || "",
    computerSkillType: computerSkill?.type || "",
    computerSkillProficiency: computerSkill?.proficiency || "",
    qualificationDate: qualification?.date || "",
    qualificationName: qualification?.name || "",
    qualificationNumber: qualification?.number || "",
    qualificationDescription: qualification?.description || "",
    familyName: family?.name || "",
    familyRelation: family?.relation || "",
    familyPhone: family?.phone || "",
    familyCompany: family?.company || "",
    familyPosition: family?.position || "",
    familyPoliticalStatus: family?.politicalStatus || "",
    publicationDate: publication?.date || "",
    publicationJournal: publication?.journal || "",
    publicationLevel: publication?.level || "",
    publicationTitle: publication?.title || "",
    publicationDescription: publication?.description || "",
    publicationAuthors: publication?.authors || "",
    publicationImpactFactor: publication?.impactFactor || "",
    publicationLink: publication?.link || "",
    patentDate: patent?.date || "",
    patentName: patent?.name || "",
    patentNumber: patent?.number || "",
    patentType: patent?.type || "",
    patentAchievement: patent?.achievement || "",
    hobbies: profile.hobbies || "",
    workName: work?.name || "",
    workLink: work?.link || "",
    workDescription: work?.description || "",
    competitionName: competition?.name || "",
    competitionDate: competition?.date || "",
    competitionDescription: competition?.description || "",
    ...(profile.extraFields || {})
  };
}
