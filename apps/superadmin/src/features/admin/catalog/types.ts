
export type SystemRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  iconKey: string | null;
  isActive: boolean;
  sortOrder: number;
  _count: { stages: number; studentProfiles: number };
};

export type StageRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  educationSystemId: string;
  hasSecondLanguage: boolean;
  isActive: boolean;
  sortOrder: number;
  system: { id: string; code: string; nameAr: string };
  _count: { gradeLevels: number };
};

export type GradeRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  stageId: string;
  level: number;
  isActive: boolean;
  sortOrder: number;
  stage: { id: string; code: string; nameAr: string; system: { id: string; code: string; nameAr: string } };
  gradeTracks: { id: string; track: { id: string; code: string; nameAr: string } }[];
};

export type TrackRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  stageId: string;
  isActive: boolean;
  sortOrder: number;
  stage: { id: string; code: string; nameAr: string; system: { id: string; code: string; nameAr: string } };
  gradeTracks: { id: string; gradeLevel: { id: string; code: string; nameAr: string } }[];
};

export type SubjectRow = {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string | null;
  language: "ar" | "en";
  isAzhari: boolean;
  isSecondLanguage: boolean;
  isActive: boolean;
  sortOrder: number;
  _count: { offerings: number; teacherSubjects: number };
};

export type OfferingRow = {
  id: string;
  isActive: boolean;
  subject: { id: string; code: string; nameAr: string; isAzhari: boolean };
  gradeLevel: {
    id: string;
    code: string;
    nameAr: string;
    stage: { nameAr: string; system: { nameAr: string } };
  };
  track: { id: string; code: string; nameAr: string } | null;
};

export type SubjectRequestRow = {
  id: string;
  suggestedName: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: { id: string; name: string; email: string | null } | null;
};
