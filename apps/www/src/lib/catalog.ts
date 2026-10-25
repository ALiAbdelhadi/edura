import type { Locale } from "@/i18n/config";

import { GRADE_LEVELS, GRADE_TRACKS, OFFERINGS, SUBJECTS_SEED, SYSTEMS, TRACKS } from "./catalog-data";

export type Named = { code: string; name: string };
// Where a subject is taught: a school year, and the track when only one track takes it.
export type Slot = { grade: string; track?: string };
export type GroupSubject = Named & { terms: string; years: number; category: SubjectCategory; slots: Slot[] };
export type GroupGrade = Named & { tracks: Named[] };

// The kinds of subject the section filters by, in the order the tabs show them.
export const SUBJECT_CATEGORIES = ["languages", "math", "sciences", "humanities", "religion", "skills"] as const;
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

const CATEGORY_OF: Record<string, SubjectCategory> = {
  arabic: "languages",
  english: "languages",
  "foreign-lang-1": "languages",
  "lang2-french": "languages",
  "lang2-german": "languages",
  "lang2-italian": "languages",
  "lang2-spanish": "languages",
  nahw: "languages",
  sarf: "languages",
  balagha: "languages",
  "adab-nusus": "languages",
  arud: "languages",
  imla: "languages",
  khatt: "languages",
  inshaa: "languages",
  math: "math",
  "math-advanced": "math",
  statistics: "math",
  accounting: "math",
  science: "sciences",
  physics: "sciences",
  chemistry: "sciences",
  biology: "sciences",
  "biology-advanced": "sciences",
  "chemistry-advanced": "sciences",
  "physics-advanced": "sciences",
  "integrated-science": "sciences",
  geology: "sciences",
  "social-studies": "humanities",
  history: "humanities",
  "egyptian-history": "humanities",
  geography: "humanities",
  philosophy: "humanities",
  mantiq: "humanities",
  "psychology-sociology": "humanities",
  economics: "humanities",
  "economics-advanced": "humanities",
  "geography-advanced": "humanities",
  psychology: "humanities",
  "business-admin": "humanities",
  civics: "humanities",
  religion: "religion",
  "quran-tajweed": "religion",
  tafsir: "religion",
  hadith: "religion",
  fiqh: "religion",
  "fiqh-hanafi": "religion",
  "fiqh-shafii": "religion",
  "fiqh-maliki": "religion",
  "fiqh-hanbali": "religion",
  "usul-fiqh": "religion",
  tawheed: "religion",
  seerah: "religion",
  "islamic-education": "religion",
  "islamic-culture": "religion",
  ict: "skills",
  computer: "skills",
  art: "skills",
  pe: "skills",
  vocational: "skills",
  "programming-ai": "skills",
  programming: "skills",
  multidisciplinary: "skills",
  music: "skills",
};

// What people type for a subject besides its two catalog names.
const ALIASES: Record<string, string> = {
  math: "حساب ماث",
  computer: "كمبيوتر",
  ict: "كمبيوتر تكنولوجيا",
  pe: "العاب رياضة",
  "social-studies": "دراسات اجتماعيات",
  "foreign-lang-1": "انجليزي فرنساوي",
  "lang2-french": "فرنساوي",
  "lang2-german": "الماني",
  "lang2-italian": "ايطالي",
  "lang2-spanish": "اسباني",
  chemistry: "كيميا",
  biology: "بيولوجي",
  statistics: "احصا",
  "psychology-sociology": "علم نفس اجتماع",
  "quran-tajweed": "قران",
  fiqh: "فقه",
  "fiqh-hanafi": "فقه حنفي ابو حنيفة",
  "fiqh-shafii": "فقه شافعي Shafii",
  "fiqh-maliki": "فقه مالكي",
  "fiqh-hanbali": "فقه حنبلي",
  tawheed: "توحيد عقيدة",
  seerah: "سيرة",
  "integrated-science": "علوم",
  "programming-ai": "برمجة ذكاء اصطناعي AI",
  multidisciplinary: "اكتشف ديسكفر",
  music: "موسيقى مزيكا",
  "business-admin": "بيزنس",
  "chemistry-advanced": "كيميا",
};

// A subject added to the catalog without a category fails the build here,
// rather than landing silently in the wrong tab.
function categoryOf(code: string): SubjectCategory {
  const category = CATEGORY_OF[code];
  if (!category) throw new Error(`catalog: subject "${code}" has no category`);
  return category;
}

// A subject's tab and the words that find it, in both languages.
export function subjectMeta(code: string): { category: SubjectCategory; terms: string } {
  const s = SUBJECTS_SEED.find((row) => row.code === code);
  if (!s) throw new Error(`catalog: unknown subject "${code}"`);
  return { category: categoryOf(code), terms: [s.nameAr, s.nameEn, ALIASES[code] ?? ""].join(" ") };
}

const pick = (locale: Locale, row: { nameAr: string; nameEn: string }) =>
  locale === "ar" ? row.nameAr : row.nameEn;

export function allSubjects(locale: Locale): Named[] {
  return SUBJECTS_SEED.map((s) => ({ code: s.code, name: pick(locale, s) }));
}

// The tabs of the subjects section: the three general stages, then Azhari and
// the Baccalaureate as one tab each.
export const SUBJECT_GROUPS = [
  "general-primary",
  "general-preparatory",
  "general-secondary",
  "azhari",
  "bacc",
] as const;
export type SubjectGroup = (typeof SUBJECT_GROUPS)[number];

function groupOf(grade: string): SubjectGroup | null {
  const stage = GRADE_LEVELS.find((g) => g.code === grade)?.stage ?? "";
  if (stage.startsWith("azhari")) return "azhari";
  if (stage.startsWith("bacc")) return "bacc";
  return (SUBJECT_GROUPS as readonly string[]).includes(stage) ? (stage as SubjectGroup) : null;
}

// Each group's subjects in catalog order, with every year (and track) that teaches them.
export function subjectsByGroup(locale: Locale): Record<SubjectGroup, GroupSubject[]> {
  const slots = new Map<string, Slot[]>();
  for (const spec of OFFERINGS) {
    for (const grade of spec.grades) {
      const group = groupOf(grade);
      if (!group) continue;
      for (const code of spec.subjects) {
        const key = `${group}|${code}`;
        (slots.get(key) ?? slots.set(key, []).get(key)!).push(spec.track ? { grade, track: spec.track } : { grade });
      }
    }
  }

  return Object.fromEntries(
    SUBJECT_GROUPS.map((group) => [
      group,
      SUBJECTS_SEED.filter((s) => slots.has(`${group}|${s.code}`)).map((s) => {
        const own = slots.get(`${group}|${s.code}`)!;
        return {
          code: s.code,
          name: pick(locale, s),
          years: new Set(own.map((slot) => slot.grade)).size,
          slots: own,
          ...subjectMeta(s.code),
        };
      }),
    ]),
  ) as Record<SubjectGroup, GroupSubject[]>;
}

// Each group's school years in order, with the tracks a year splits into.
export function gradesByGroup(locale: Locale): Record<SubjectGroup, GroupGrade[]> {
  return Object.fromEntries(
    SUBJECT_GROUPS.map((group) => [
      group,
      GRADE_LEVELS.filter((g) => groupOf(g.code) === group).map((g) => ({
        code: g.code,
        // "الثالث الثانوي" fits a phone-width select; "الصف" and "(بكالوريا)"
        // repeat the label and the tab beside it.
        name: pick(locale, g).replace(/^الصف /, "").replace(/ \(بكالوريا\)$/, ""),
        tracks: (GRADE_TRACKS.find((row) => row.grade === g.code)?.tracks ?? []).map((code) => {
          const track = TRACKS.find((row) => row.code === code)!;
          return { code, name: pick(locale, track) };
        }),
      })),
    ]),
  ) as Record<SubjectGroup, GroupGrade[]>;
}

export const CATALOG_COUNTS = {
  systems: SYSTEMS.length,
  grades: GRADE_LEVELS.length,
  tracks: TRACKS.length,
  // Only subjects some year actually takes.
  subjects: new Set(OFFERINGS.flatMap((spec) => spec.subjects)).size,
};
