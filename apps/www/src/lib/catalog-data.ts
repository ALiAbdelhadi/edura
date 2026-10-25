// Copy of the permanent education catalog in
// packages/database/prisma/seed-catalog.ts — the marketing site renders it
// statically and never queries the database. Keep the two in step.

export const SYSTEMS = [
  { code: "general", nameAr: "التعليم العام", nameEn: "General", iconKey: "school", sortOrder: 0, codeLetter: "G" },
  { code: "azhari", nameAr: "التعليم الأزهري", nameEn: "Azhari", iconKey: "moon-star", sortOrder: 1, codeLetter: "A" },
  { code: "bacc", nameAr: "شهادة البكالوريا", nameEn: "Egyptian Baccalaureate", iconKey: "graduation-cap", sortOrder: 2, codeLetter: "B" },
] as const;

export const STAGES = [
  { code: "general-primary", system: "general", nameAr: "المرحلة الابتدائية", nameEn: "Primary", hasSecondLanguage: false, sortOrder: 0 },
  { code: "general-preparatory", system: "general", nameAr: "المرحلة الإعدادية", nameEn: "Preparatory", hasSecondLanguage: true, sortOrder: 1 },
  { code: "general-secondary", system: "general", nameAr: "المرحلة الثانوية", nameEn: "Secondary", hasSecondLanguage: true, sortOrder: 2 },
  { code: "azhari-primary", system: "azhari", nameAr: "المرحلة الابتدائية الأزهرية", nameEn: "Azhari Primary", hasSecondLanguage: false, sortOrder: 0 },
  { code: "azhari-preparatory", system: "azhari", nameAr: "المرحلة الإعدادية الأزهرية", nameEn: "Azhari Preparatory", hasSecondLanguage: false, sortOrder: 1 },
  { code: "azhari-secondary", system: "azhari", nameAr: "المرحلة الثانوية الأزهرية", nameEn: "Azhari Secondary", hasSecondLanguage: false, sortOrder: 2 },
  { code: "bacc-secondary", system: "bacc", nameAr: "المرحلة الثانوية (بكالوريا)", nameEn: "Baccalaureate Secondary", hasSecondLanguage: false, sortOrder: 0 },
] as const;

const ORDINAL_AR = ["الأول", "الثاني", "الثالث", "الرابع", "الخامس", "السادس"] as const;

function grades(stage: string, stageNameAr: string, stageNameEn: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    code: `${stage}-${i + 1}`,
    stage,
    nameAr: `الصف ${ORDINAL_AR[i]} ${stageNameAr}`,
    nameEn: `${stageNameEn} ${i + 1}`,
    level: i + 1,
    sortOrder: i,
  }));
}

export const GRADE_LEVELS = [
  ...grades("general-primary", "الابتدائي", "Primary", 6),
  ...grades("general-preparatory", "الإعدادي", "Preparatory", 3),
  ...grades("general-secondary", "الثانوي", "Secondary", 3),
  ...grades("azhari-primary", "الابتدائي الأزهري", "Azhari Primary", 6),
  ...grades("azhari-preparatory", "الإعدادي الأزهري", "Azhari Preparatory", 3),
  ...grades("azhari-secondary", "الثانوي الأزهري", "Azhari Secondary", 3),
  ...grades("bacc-secondary", "الثانوي (بكالوريا)", "Baccalaureate", 3),
];

export const TRACKS = [
  { code: "general-scientific", stage: "general-secondary", nameAr: "علمي", nameEn: "Scientific", sortOrder: 0 },
  { code: "general-sci-science", stage: "general-secondary", nameAr: "علمي علوم", nameEn: "Science", sortOrder: 0 },
  { code: "general-sci-math", stage: "general-secondary", nameAr: "علمي رياضة", nameEn: "Math", sortOrder: 1 },
  { code: "general-literary", stage: "general-secondary", nameAr: "أدبي", nameEn: "Literary", sortOrder: 2 },
  { code: "bacc-medicine", stage: "bacc-secondary", nameAr: "مسار الطب وعلوم الحياة", nameEn: "Medicine & Life Sciences", sortOrder: 0 },
  { code: "bacc-engineering", stage: "bacc-secondary", nameAr: "مسار الهندسة وعلوم الحاسب", nameEn: "Engineering & CS", sortOrder: 1 },
  { code: "bacc-business", stage: "bacc-secondary", nameAr: "مسار الأعمال", nameEn: "Business", sortOrder: 2 },
  { code: "bacc-arts", stage: "bacc-secondary", nameAr: "مسار الآداب والفنون", nameEn: "Arts & Humanities", sortOrder: 3 },
  { code: "azhari-scientific", stage: "azhari-secondary", nameAr: "علمي", nameEn: "Scientific", sortOrder: 0 },
  { code: "azhari-literary", stage: "azhari-secondary", nameAr: "أدبي", nameEn: "Literary", sortOrder: 1 },
] as const;

export const GRADE_TRACKS: { grade: string; tracks: readonly string[] }[] = [
  { grade: "general-secondary-2", tracks: ["general-scientific", "general-literary"] },
  { grade: "general-secondary-3", tracks: ["general-sci-science", "general-sci-math", "general-literary"] },
  { grade: "bacc-secondary-2", tracks: ["bacc-medicine", "bacc-engineering", "bacc-business", "bacc-arts"] },
  { grade: "bacc-secondary-3", tracks: ["bacc-medicine", "bacc-engineering", "bacc-business", "bacc-arts"] },
  { grade: "azhari-secondary-2", tracks: ["azhari-scientific", "azhari-literary"] },
  { grade: "azhari-secondary-3", tracks: ["azhari-scientific", "azhari-literary"] },
];

type SubjectSeed = {
  code: string;
  nameAr: string;
  nameEn: string;
  isAzhari?: boolean;
  isSecondLanguage?: boolean;
};

export const SUBJECTS_SEED: SubjectSeed[] = [
  { code: "arabic", nameAr: "اللغة العربية", nameEn: "Arabic" },
  { code: "english", nameAr: "اللغة الإنجليزية", nameEn: "English" },
  { code: "math", nameAr: "الرياضيات", nameEn: "Mathematics" },
  { code: "science", nameAr: "العلوم", nameEn: "Science" },
  { code: "social-studies", nameAr: "الدراسات الاجتماعية", nameEn: "Social Studies" },
  { code: "religion", nameAr: "التربية الدينية", nameEn: "Religious Education" },
  { code: "ict", nameAr: "تكنولوجيا المعلومات والاتصالات", nameEn: "ICT" },
  { code: "art", nameAr: "التربية الفنية", nameEn: "Art" },
  { code: "pe", nameAr: "التربية الرياضية", nameEn: "Physical Education" },
  { code: "vocational", nameAr: "المهارات المهنية", nameEn: "Vocational Skills" },
  { code: "computer", nameAr: "الحاسب الآلي", nameEn: "Computer Science" },
  { code: "physics", nameAr: "الفيزياء", nameEn: "Physics" },
  { code: "chemistry", nameAr: "الكيمياء", nameEn: "Chemistry" },
  { code: "biology", nameAr: "الأحياء", nameEn: "Biology" },
  { code: "history", nameAr: "التاريخ", nameEn: "History" },
  { code: "geography", nameAr: "الجغرافيا", nameEn: "Geography" },
  { code: "philosophy", nameAr: "الفلسفة والمنطق", nameEn: "Philosophy & Logic" },
  { code: "civics", nameAr: "التربية الوطنية", nameEn: "Civics" },
  { code: "geology", nameAr: "الجيولوجيا", nameEn: "Geology" },
  { code: "psychology-sociology", nameAr: "علم النفس والاجتماع", nameEn: "Psychology & Sociology" },
  { code: "statistics", nameAr: "الإحصاء", nameEn: "Statistics" },
  { code: "foreign-lang-1", nameAr: "اللغة الأجنبية الأولى", nameEn: "First Foreign Language" },
  { code: "egyptian-history", nameAr: "التاريخ المصري", nameEn: "Egyptian History" },
  { code: "economics", nameAr: "الاقتصاد", nameEn: "Economics" },
  { code: "math-advanced", nameAr: "الرياضيات (مستوى رفيع)", nameEn: "Advanced Mathematics" },
  { code: "biology-advanced", nameAr: "الأحياء (مستوى رفيع)", nameEn: "Advanced Biology" },
  { code: "lang2-french", nameAr: "اللغة الفرنسية", nameEn: "French", isSecondLanguage: true },
  { code: "lang2-german", nameAr: "اللغة الألمانية", nameEn: "German", isSecondLanguage: true },
  { code: "lang2-italian", nameAr: "اللغة الإيطالية", nameEn: "Italian", isSecondLanguage: true },
  { code: "lang2-spanish", nameAr: "اللغة الإسبانية", nameEn: "Spanish", isSecondLanguage: true },
  { code: "quran-tajweed", nameAr: "القرآن الكريم والتجويد", nameEn: "Quran & Tajweed", isAzhari: true },
  { code: "tafsir", nameAr: "التفسير", nameEn: "Tafsir", isAzhari: true },
  { code: "hadith", nameAr: "الحديث", nameEn: "Hadith", isAzhari: true },
  { code: "fiqh", nameAr: "الفقه", nameEn: "Fiqh", isAzhari: true },
  { code: "fiqh-hanafi", nameAr: "الفقه الحنفي", nameEn: "Hanafi Fiqh", isAzhari: true },
  { code: "fiqh-shafii", nameAr: "الفقه الشافعي", nameEn: "Shafi'i Fiqh", isAzhari: true },
  { code: "fiqh-maliki", nameAr: "الفقه المالكي", nameEn: "Maliki Fiqh", isAzhari: true },
  { code: "fiqh-hanbali", nameAr: "الفقه الحنبلي", nameEn: "Hanbali Fiqh", isAzhari: true },
  { code: "usul-fiqh", nameAr: "أصول الفقه", nameEn: "Usul al-Fiqh", isAzhari: true },
  { code: "tawheed", nameAr: "التوحيد والعقيدة", nameEn: "Tawheed & Aqeedah", isAzhari: true },
  { code: "nahw", nameAr: "النحو", nameEn: "Nahw (Grammar)", isAzhari: true },
  { code: "sarf", nameAr: "الصرف", nameEn: "Sarf (Morphology)", isAzhari: true },
  { code: "balagha", nameAr: "البلاغة", nameEn: "Balagha (Rhetoric)", isAzhari: true },
  { code: "adab-nusus", nameAr: "الأدب والنصوص", nameEn: "Literature & Texts", isAzhari: true },
  { code: "arud", nameAr: "العروض والقافية", nameEn: "Prosody", isAzhari: true },
  { code: "mantiq", nameAr: "المنطق", nameEn: "Mantiq (Logic)", isAzhari: true },
  { code: "seerah", nameAr: "السيرة النبوية", nameEn: "Seerah", isAzhari: true },
  { code: "khatt", nameAr: "الخط العربي", nameEn: "Arabic Calligraphy", isAzhari: true },
  { code: "imla", nameAr: "الإملاء", nameEn: "Imla (Dictation)", isAzhari: true },
  { code: "inshaa", nameAr: "الإنشاء", nameEn: "Composition", isAzhari: true },
  { code: "islamic-education", nameAr: "التربية الإسلامية", nameEn: "Islamic Education", isAzhari: true },
  { code: "islamic-culture", nameAr: "الثقافة الإسلامية", nameEn: "Islamic Culture", isAzhari: true },
  { code: "integrated-science", nameAr: "العلوم المتكاملة", nameEn: "Integrated Science" },
  { code: "programming-ai", nameAr: "البرمجة والذكاء الاصطناعي", nameEn: "Programming & AI" },
  { code: "programming", nameAr: "البرمجة", nameEn: "Programming" },
  { code: "multidisciplinary", nameAr: "متعدد التخصصات", nameEn: "Discover (Multidisciplinary)" },
  { code: "music", nameAr: "التربية الموسيقية", nameEn: "Music" },
  { code: "psychology", nameAr: "علم النفس", nameEn: "Psychology" },
  { code: "accounting", nameAr: "المحاسبة", nameEn: "Accounting" },
  { code: "business-admin", nameAr: "إدارة الأعمال", nameEn: "Business Administration" },
  { code: "chemistry-advanced", nameAr: "الكيمياء (مستوى رفيع)", nameEn: "Advanced Chemistry" },
  { code: "physics-advanced", nameAr: "الفيزياء (مستوى رفيع)", nameEn: "Advanced Physics" },
  { code: "economics-advanced", nameAr: "الاقتصاد (مستوى رفيع)", nameEn: "Advanced Economics" },
  { code: "geography-advanced", nameAr: "الجغرافيا (مستوى رفيع)", nameEn: "Advanced Geography" },
];


const SECOND_LANGS = ["lang2-french", "lang2-german", "lang2-italian", "lang2-spanish"];
// Azhari fiqh is taught by madhhab from preparatory on; each student studies one.
const FIQH_MADHAHIB = ["fiqh-hanafi", "fiqh-shafii", "fiqh-maliki", "fiqh-hanbali"];
const range = (stage: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${stage}-${from + i}`);

type OfferingSpec = { subjects: string[]; grades: string[]; track?: string };

export const OFFERINGS: OfferingSpec[] = [
  { subjects: ["arabic", "english", "math", "religion", "art", "music", "pe"], grades: range("general-primary", 1, 6) },
  { subjects: ["multidisciplinary"], grades: range("general-primary", 1, 3) },
  { subjects: ["science", "social-studies", "ict", "vocational"], grades: range("general-primary", 4, 6) },
  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "religion", "computer", "art", "pe", ...SECOND_LANGS],
    grades: range("general-preparatory", 1, 3),
  },
  {
    subjects: ["arabic", "english", "history", "math", "integrated-science", "philosophy", "religion", "pe", "programming-ai", ...SECOND_LANGS],
    grades: ["general-secondary-1"],
  },
  { subjects: ["arabic", "english", "religion", "civics", "pe", ...SECOND_LANGS], grades: range("general-secondary", 2, 3) },
  { subjects: ["math", "history"], grades: ["general-secondary-2"] },
  { subjects: ["chemistry", "physics"], grades: ["general-secondary-2"], track: "general-scientific" },
  { subjects: ["geography", "psychology"], grades: ["general-secondary-2"], track: "general-literary" },
  { subjects: ["biology", "chemistry", "physics"], grades: ["general-secondary-3"], track: "general-sci-science" },
  { subjects: ["math", "chemistry", "physics"], grades: ["general-secondary-3"], track: "general-sci-math" },
  { subjects: ["history", "geography", "statistics"], grades: ["general-secondary-3"], track: "general-literary" },

  { subjects: ["arabic", "english", "math", "art", "pe", "quran-tajweed", "islamic-education", "imla", "khatt"], grades: range("azhari-primary", 1, 6) },
  { subjects: ["science", "social-studies", "ict", "vocational"], grades: range("azhari-primary", 4, 6) },
  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "computer", "art", "pe"],
    grades: range("azhari-preparatory", 1, 3),
  },
  {
    subjects: ["quran-tajweed", ...FIQH_MADHAHIB, "tawheed", "seerah", "nahw", "tafsir", "hadith", "sarf", "adab-nusus"],
    grades: range("azhari-preparatory", 1, 3),
  },
  { subjects: ["islamic-culture"], grades: ["azhari-preparatory-3"] },
  {
    subjects: ["arabic", "english", "quran-tajweed", "tafsir", "hadith", ...FIQH_MADHAHIB, "tawheed", "nahw", "sarf", "balagha", "adab-nusus", "inshaa"],
    grades: range("azhari-secondary", 1, 3),
  },
  // The Azhari Baccalaureate (from 2026/27): one common first year, no tracks;
  // "التوحيد والمنطق القديم" is taught as tawheed + mantiq to every student.
  {
    subjects: ["mantiq", "islamic-culture", "math", "integrated-science", "egyptian-history", "philosophy", "programming-ai", ...SECOND_LANGS],
    grades: ["azhari-secondary-1"],
  },
  { subjects: ["math", "physics", "chemistry", "biology"], grades: range("azhari-secondary", 2, 3), track: "azhari-scientific" },
  { subjects: ["history", "geography", "arud", "mantiq"], grades: range("azhari-secondary", 2, 3), track: "azhari-literary" },
  { subjects: ["psychology", ...SECOND_LANGS], grades: ["azhari-secondary-2"], track: "azhari-literary" },
  { subjects: ["statistics"], grades: ["azhari-secondary-3"], track: "azhari-literary" },

  { subjects: ["religion"], grades: range("bacc-secondary", 1, 3) },
  {
    subjects: ["arabic", "foreign-lang-1", "history", "math", "integrated-science", "philosophy", "pe", "programming-ai", ...SECOND_LANGS],
    grades: ["bacc-secondary-1"],
  },
  { subjects: ["arabic", "foreign-lang-1", "egyptian-history"], grades: ["bacc-secondary-2"] },
  { subjects: ["math", "physics"], grades: ["bacc-secondary-2"], track: "bacc-medicine" },
  { subjects: ["chemistry", "programming"], grades: ["bacc-secondary-2"], track: "bacc-engineering" },
  { subjects: ["business-admin", "accounting"], grades: ["bacc-secondary-2"], track: "bacc-business" },
  { subjects: ["psychology", ...SECOND_LANGS], grades: ["bacc-secondary-2"], track: "bacc-arts" },
  { subjects: ["biology-advanced", "chemistry-advanced"], grades: ["bacc-secondary-3"], track: "bacc-medicine" },
  { subjects: ["math-advanced", "physics-advanced"], grades: ["bacc-secondary-3"], track: "bacc-engineering" },
  { subjects: ["economics-advanced", "math"], grades: ["bacc-secondary-3"], track: "bacc-business" },
  { subjects: ["geography-advanced", "statistics"], grades: ["bacc-secondary-3"], track: "bacc-arts" },
];
