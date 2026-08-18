
export type CatalogTrackOption = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
};

export type CatalogGrade = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  level: number;
  trackOptions: CatalogTrackOption[];
};

export type CatalogStage = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  hasSecondLanguage: boolean;
  gradeLevels: CatalogGrade[];
};

export type CatalogSystem = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  iconKey: string | null;
  stages: CatalogStage[];
};

export type CatalogSubject = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  isAzhari: boolean;
  isSecondLanguage: boolean;
  gradeLevelIds?: string[];
};

export type StudentSelections = {
  educationSystemId?: string;
  stageId?: string;
  gradeLevelId?: string;
  trackId?: string | null;
  secondLanguageSubjectId?: string | null;
};

export type TeacherSelections = {
  gradeLevelIds: string[];
  subjectIds: string[];
};
