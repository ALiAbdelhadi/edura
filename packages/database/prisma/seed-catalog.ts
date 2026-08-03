/* eslint-disable no-console */
import { withPlatformContext } from "../src/index";


// `codeLetter` opens every student code issued under the system (G7K3-M2QF).
// It is part of an identifier a student carries on a card for years, so these
// letters are APPEND-ONLY in spirit: add one for a new system, never re-point
// an existing one, or every code already issued starts naming the wrong system.
// 'X' is reserved for "system not chosen yet" and the DB refuses it here.
const SYSTEMS = [
  { code: "general", nameAr: "التعليم العام", nameEn: "General", iconKey: "school", sortOrder: 0, codeLetter: "G" },
  { code: "azhari", nameAr: "التعليم الأزهري", nameEn: "Azhari", iconKey: "moon-star", sortOrder: 1, codeLetter: "A" },
  { code: "bacc", nameAr: "شهادة البكالوريا", nameEn: "Egyptian Baccalaureate", iconKey: "graduation-cap", sortOrder: 2, codeLetter: "B" },
] as const;

const STAGES = [
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

const GRADE_LEVELS = [
  ...grades("general-primary", "الابتدائي", "Primary", 6),
  ...grades("general-preparatory", "الإعدادي", "Preparatory", 3),
  ...grades("general-secondary", "الثانوي", "Secondary", 3),
  ...grades("azhari-primary", "الابتدائي الأزهري", "Azhari Primary", 6),
  ...grades("azhari-preparatory", "الإعدادي الأزهري", "Azhari Preparatory", 3),
  ...grades("azhari-secondary", "الثانوي الأزهري", "Azhari Secondary", 3),
  ...grades("bacc-secondary", "الثانوي (بكالوريا)", "Baccalaureate", 3),
];

const TRACKS = [
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

const GRADE_TRACKS: { grade: string; tracks: readonly string[] }[] = [
  { grade: "general-secondary-2", tracks: ["general-sci-science", "general-sci-math", "general-literary"] },
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

const SUBJECTS_SEED: SubjectSeed[] = [
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
];


const SECOND_LANGS = ["lang2-french", "lang2-german", "lang2-italian", "lang2-spanish"];
const range = (stage: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${stage}-${from + i}`);

type OfferingSpec = { subjects: string[]; grades: string[]; track?: string };

const OFFERINGS: OfferingSpec[] = [
  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "religion", "ict", "art", "pe", "vocational"],
    grades: range("general-primary", 1, 6),
  },
  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "religion", "computer", "art", "pe", ...SECOND_LANGS],
    grades: range("general-preparatory", 1, 3),
  },
  {
    subjects: ["arabic", "english", "math", "physics", "chemistry", "biology", "history", "geography", "philosophy", "religion", "civics", ...SECOND_LANGS],
    grades: ["general-secondary-1"],
  },
  {
    subjects: ["arabic", "english", "religion", "civics", ...SECOND_LANGS],
    grades: range("general-secondary", 2, 3),
  },
  { subjects: ["biology", "chemistry", "physics", "geology"], grades: range("general-secondary", 2, 3), track: "general-sci-science" },
  { subjects: ["math", "physics", "chemistry"], grades: range("general-secondary", 2, 3), track: "general-sci-math" },
  { subjects: ["history", "geography", "philosophy", "psychology-sociology", "statistics"], grades: range("general-secondary", 2, 3), track: "general-literary" },

  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "ict", "art", "pe", "vocational"],
    grades: range("azhari-primary", 1, 6),
  },
  {
    subjects: ["arabic", "english", "math", "science", "social-studies", "computer", "art", "pe"],
    grades: range("azhari-preparatory", 1, 3),
  },
  {
    subjects: ["arabic", "english", "math", "physics", "chemistry", "biology", "history", "geography", "philosophy"],
    grades: ["azhari-secondary-1"],
  },
  { subjects: ["arabic", "english"], grades: range("azhari-secondary", 2, 3) },
  { subjects: ["math", "physics", "chemistry", "biology"], grades: range("azhari-secondary", 2, 3), track: "azhari-scientific" },
  { subjects: ["history", "geography", "philosophy", "psychology-sociology"], grades: range("azhari-secondary", 2, 3), track: "azhari-literary" },
  {
    subjects: ["quran-tajweed", "fiqh", "tawheed", "seerah", "nahw", "imla", "khatt"],
    grades: range("azhari-primary", 1, 6),
  },
  {
    subjects: ["quran-tajweed", "fiqh", "tawheed", "seerah", "nahw", "imla", "khatt", "tafsir", "hadith", "sarf", "adab-nusus"],
    grades: range("azhari-preparatory", 1, 3),
  },
  {
    subjects: SUBJECTS_SEED.filter((s) => s.isAzhari).map((s) => s.code),
    grades: range("azhari-secondary", 1, 3),
  },

  {
    subjects: ["arabic", "foreign-lang-1", "egyptian-history", "religion"],
    grades: range("bacc-secondary", 1, 3),
  },
  { subjects: ["math", "science"], grades: ["bacc-secondary-1"] },
  { subjects: ["biology-advanced", "chemistry"], grades: range("bacc-secondary", 2, 3), track: "bacc-medicine" },
  { subjects: ["math-advanced", "physics"], grades: range("bacc-secondary", 2, 3), track: "bacc-engineering" },
  { subjects: ["economics", "math"], grades: range("bacc-secondary", 2, 3), track: "bacc-business" },
  { subjects: ["geography", "statistics"], grades: range("bacc-secondary", 2, 3), track: "bacc-arts" },
];


const TX = { timeout: 120_000, maxWait: 15_000 };

export async function seedCatalog() {
  const stageIds = await withPlatformContext(async (tx) => {
    const systemIds = new Map<string, string>();
    for (const s of SYSTEMS) {
      const row = await tx.educationSystem.upsert({
        where: { code: s.code },
        update: { codeLetter: s.codeLetter },
        create: { code: s.code, nameAr: s.nameAr, nameEn: s.nameEn, iconKey: s.iconKey, sortOrder: s.sortOrder, codeLetter: s.codeLetter },
      });
      systemIds.set(s.code, row.id);
    }
    const ids = new Map<string, string>();
    for (const st of STAGES) {
      const row = await tx.stage.upsert({
        where: { code: st.code },
        update: {},
        create: {
          code: st.code,
          educationSystemId: systemIds.get(st.system)!,
          nameAr: st.nameAr,
          nameEn: st.nameEn,
          hasSecondLanguage: st.hasSecondLanguage,
          sortOrder: st.sortOrder,
        },
      });
      ids.set(st.code, row.id);
    }
    return ids;
  }, TX);

  const { gradeIds, trackIds } = await withPlatformContext(async (tx) => {
    const gIds = new Map<string, string>();
    for (const g of GRADE_LEVELS) {
      const row = await tx.gradeLevel.upsert({
        where: { code: g.code },
        update: {},
        create: {
          code: g.code,
          stageId: stageIds.get(g.stage)!,
          nameAr: g.nameAr,
          nameEn: g.nameEn,
          level: g.level,
          sortOrder: g.sortOrder,
        },
      });
      gIds.set(g.code, row.id);
    }
    const tIds = new Map<string, string>();
    for (const t of TRACKS) {
      const row = await tx.track.upsert({
        where: { code: t.code },
        update: {},
        create: { code: t.code, stageId: stageIds.get(t.stage)!, nameAr: t.nameAr, nameEn: t.nameEn, sortOrder: t.sortOrder },
      });
      tIds.set(t.code, row.id);
    }
    await tx.gradeLevelTrack.createMany({
      data: GRADE_TRACKS.flatMap((gt) =>
        gt.tracks.map((trackCode) => ({
          gradeLevelId: gIds.get(gt.grade)!,
          trackId: tIds.get(trackCode)!,
        })),
      ),
      skipDuplicates: true,
    });
    return { gradeIds: gIds, trackIds: tIds };
  }, TX);

  const subjectIds = await withPlatformContext(async (tx) => {
    const ids = new Map<string, string>();
    for (const [i, s] of SUBJECTS_SEED.entries()) {
      const row = await tx.subject.upsert({
        where: { code: s.code },
        update: {},
        create: {
          code: s.code,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          isAzhari: s.isAzhari ?? false,
          isSecondLanguage: s.isSecondLanguage ?? false,
          sortOrder: i,
        },
      });
      ids.set(s.code, row.id);
    }
    return ids;
  }, TX);

  const offeringCount = await withPlatformContext(async (tx) => {
    const rows = OFFERINGS.flatMap((spec) =>
      spec.grades.flatMap((gradeCode) =>
        spec.subjects.map((subjectCode) => ({
          subjectId: subjectIds.get(subjectCode)!,
          gradeLevelId: gradeIds.get(gradeCode)!,
          trackId: spec.track ? trackIds.get(spec.track)! : null,
        })),
      ),
    );
    for (const r of rows) {
      if (!r.subjectId || !r.gradeLevelId) throw new Error("seed-catalog: unresolved code in OFFERINGS");
    }
    const res = await tx.subjectOffering.createMany({ data: rows, skipDuplicates: true });
    return { attempted: rows.length, created: res.count };
  }, TX);

  console.log("Catalog seed complete:", {
    systems: SYSTEMS.length,
    stages: STAGES.length,
    gradeLevels: GRADE_LEVELS.length,
    tracks: TRACKS.length,
    gradeTrackLinks: GRADE_TRACKS.reduce((n, gt) => n + gt.tracks.length, 0),
    subjects: SUBJECTS_SEED.length,
    offerings: offeringCount,
  });
}
