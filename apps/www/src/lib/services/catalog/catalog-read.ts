import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { filterStudentSecondLanguage } from "./second-language";

export function getCatalogTree() {
  return platformDb(async (tx) => {
    const systems = await tx.educationSystem.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        iconKey: true,
        stages: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            code: true,
            nameAr: true,
            nameEn: true,
            hasSecondLanguage: true,
            gradeLevels: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" },
              select: {
                id: true,
                code: true,
                nameAr: true,
                nameEn: true,
                level: true,
                gradeTracks: {
                  where: { track: { isActive: true } },
                  select: {
                    track: {
                      select: { id: true, code: true, nameAr: true, nameEn: true, sortOrder: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    return systems.map((sys) => ({
      ...sys,
      stages: sys.stages.map((stage) => ({
        ...stage,
        gradeLevels: stage.gradeLevels.map(({ gradeTracks, ...grade }) => ({
          ...grade,
          trackOptions: gradeTracks
            .map((gt) => gt.track)
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map(({ sortOrder: _sortOrder, ...t }) => t),
        })),
      })),
    }));
  });
}

export function getSubjectsForSelection(gradeLevelId: string, trackId?: string | null) {
  return platformDb(async (tx) => {
    const offerings = await tx.subjectOffering.findMany({
      where: {
        gradeLevelId,
        isActive: true,
        OR: [{ trackId: null }, ...(trackId ? [{ trackId }] : [])],
        subject: { is: { isActive: true } },
      },
      select: {
        trackId: true,
        subject: {
          select: {
            id: true,
            code: true,
            nameAr: true,
            nameEn: true,
            language: true,
            isAzhari: true,
            isSecondLanguage: true,
            sortOrder: true,
          },
        },
      },
    });
    const seen = new Set<string>();
    return offerings
      .map((o) => o.subject)
      .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ sortOrder: _sortOrder, ...s }) => s);
  });
}

export function getAllActiveSubjects() {
  return platformDb(async (tx) => {
    const subjects = await tx.subject.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: {
        id: true,
        code: true,
        nameAr: true,
        nameEn: true,
        language: true,
        isAzhari: true,
        isSecondLanguage: true,
      },
    });
    return subjects;
  });
}

/**
 * The student's OWN subject list (the "My subjects" default view): the subjects
 * of their grade + track, minus every second foreign language EXCEPT the one
 * they picked at onboarding. A student who skipped the step gets none of them.
 * Resolved from the profile on every call so it always tracks profile changes.
 */
export async function getStudentOwnSubjects(userId: string) {
  const profile = await platformDb((tx) =>
    tx.studentProfile.findUnique({
      where: { userId },
      select: { gradeLevelId: true, trackId: true, secondLanguageSubjectId: true },
    }),
  );
  if (!profile) throw new NotFoundError("Student profile not found");
  if (!profile.gradeLevelId) return [];
  const subjects = await getSubjectsForSelection(profile.gradeLevelId, profile.trackId);
  return filterStudentSecondLanguage(subjects, profile.secondLanguageSubjectId);
}

export async function getSecondLanguageOptions(gradeLevelId: string) {
  const subjects = await getSubjectsForSelection(gradeLevelId, null);
  return subjects.filter((s) => s.isSecondLanguage);
}

export function getSubjectsForGradeLevels(gradeLevelIds: string[]) {
  if (gradeLevelIds.length === 0) return Promise.resolve([]);
  return platformDb(async (tx) => {
    const offerings = await tx.subjectOffering.findMany({
      where: {
        gradeLevelId: { in: gradeLevelIds },
        isActive: true,
        subject: { is: { isActive: true } },
      },
      select: {
        gradeLevelId: true,
        subject: {
          select: { id: true, code: true, nameAr: true, nameEn: true, isAzhari: true, isSecondLanguage: true, sortOrder: true },
        },
      },
    });
    const byId = new Map<string, { subject: (typeof offerings)[number]["subject"]; gradeLevelIds: Set<string> }>();
    for (const o of offerings) {
      const entry = byId.get(o.subject.id) ?? { subject: o.subject, gradeLevelIds: new Set<string>() };
      entry.gradeLevelIds.add(o.gradeLevelId);
      byId.set(o.subject.id, entry);
    }
    return [...byId.values()]
      .sort((a, b) => a.subject.sortOrder - b.subject.sortOrder)
      .map(({ subject: { sortOrder: _sortOrder, ...subject }, gradeLevelIds: ids }) => ({
        ...subject,
        gradeLevelIds: [...ids],
      }));
  });
}
