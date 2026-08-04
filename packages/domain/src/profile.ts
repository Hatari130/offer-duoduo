export interface ProfileEducation {
  id: string;
  school: string;
  major: string;
  degree: string;
  startDate: string;
  endDate: string;
  gpa: string;
}

export interface ProfileExperience {
  id: string;
  organization: string;
  title: string;
  startDate: string;
  endDate: string;
  description: string;
}

export interface ProfileProject {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  description: string;
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
