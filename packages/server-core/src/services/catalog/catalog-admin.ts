import { platformDb } from "../../db/scope";
import { ConflictError, NotFoundError, ValidationError } from "../../errors/classes";
import type { Locale } from "@repo/database";

type BaseCreate = {
  code: string;
  nameAr: string;
  nameEn?: string;
  isActive?: boolean;
  sortOrder?: number;
};
type BasePatch = Partial<Omit<BaseCreate, "code">>;

async function assertUniqueCode(
  tx: { $queryRaw?: unknown },
  finder: () => Promise<{ id: string } | null>,
  code: string,
) {
  if (await finder()) throw new ConflictError(`code '${code}' already exists`);
}


export function listSystems() {
  return platformDb((tx) =>
    tx.educationSystem.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { stages: true, studentProfiles: true } } },
    }),
  );
}

export function createSystem(data: BaseCreate & { iconKey?: string }) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.educationSystem.findUnique({ where: { code: data.code } }), data.code);
    return tx.educationSystem.create({ data });
  });
}

export function updateSystem(id: string, data: BasePatch & { iconKey?: string }) {
  return platformDb(async (tx) => {
    if (!(await tx.educationSystem.findUnique({ where: { id } }))) throw new NotFoundError("System not found");
    return tx.educationSystem.update({ where: { id }, data });
  });
}


export function listStages(educationSystemId?: string) {
  return platformDb((tx) =>
    tx.stage.findMany({
      where: educationSystemId ? { educationSystemId } : undefined,
      orderBy: [{ educationSystemId: "asc" }, { sortOrder: "asc" }],
      include: {
        system: { select: { id: true, code: true, nameAr: true } },
        _count: { select: { gradeLevels: true } },
      },
    }),
  );
}

export function createStage(data: BaseCreate & { educationSystemId: string; hasSecondLanguage?: boolean }) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.stage.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.educationSystem.findUnique({ where: { id: data.educationSystemId } })))
      throw new NotFoundError("Education system not found");
    return tx.stage.create({ data });
  });
}

export function updateStage(id: string, data: BasePatch & { hasSecondLanguage?: boolean }) {
  return platformDb(async (tx) => {
    if (!(await tx.stage.findUnique({ where: { id } }))) throw new NotFoundError("Stage not found");
    return tx.stage.update({ where: { id }, data });
  });
}


export function listGradeLevels(stageId?: string) {
  return platformDb((tx) =>
    tx.gradeLevel.findMany({
      where: stageId ? { stageId } : undefined,
      orderBy: [{ stageId: "asc" }, { sortOrder: "asc" }],
      include: {
        stage: { select: { id: true, code: true, nameAr: true, system: { select: { id: true, code: true, nameAr: true } } } },
        gradeTracks: { select: { id: true, track: { select: { id: true, code: true, nameAr: true } } } },
      },
    }),
  );
}

export function createGradeLevel(data: BaseCreate & { stageId: string; level: number }) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.gradeLevel.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.stage.findUnique({ where: { id: data.stageId } }))) throw new NotFoundError("Stage not found");
    return tx.gradeLevel.create({ data });
  });
}

export function updateGradeLevel(id: string, data: BasePatch & { level?: number }) {
  return platformDb(async (tx) => {
    if (!(await tx.gradeLevel.findUnique({ where: { id } }))) throw new NotFoundError("Grade level not found");
    return tx.gradeLevel.update({ where: { id }, data });
  });
}


export function listTracks(stageId?: string) {
  return platformDb((tx) =>
    tx.track.findMany({
      where: stageId ? { stageId } : undefined,
      orderBy: [{ stageId: "asc" }, { sortOrder: "asc" }],
      include: {
        stage: { select: { id: true, code: true, nameAr: true, system: { select: { id: true, code: true, nameAr: true } } } },
        gradeTracks: { select: { id: true, gradeLevel: { select: { id: true, code: true, nameAr: true } } } },
      },
    }),
  );
}

export function createTrack(data: BaseCreate & { stageId: string }) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.track.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.stage.findUnique({ where: { id: data.stageId } }))) throw new NotFoundError("Stage not found");
    return tx.track.create({ data });
  });
}

export function updateTrack(id: string, data: BasePatch) {
  return platformDb(async (tx) => {
    if (!(await tx.track.findUnique({ where: { id } }))) throw new NotFoundError("Track not found");
    return tx.track.update({ where: { id }, data });
  });
}

export function linkGradeTrack(gradeLevelId: string, trackId: string) {
  return platformDb(async (tx) => {
    const [grade, track] = await Promise.all([
      tx.gradeLevel.findUnique({ where: { id: gradeLevelId }, select: { stageId: true } }),
      tx.track.findUnique({ where: { id: trackId }, select: { stageId: true } }),
    ]);
    if (!grade) throw new NotFoundError("Grade level not found");
    if (!track) throw new NotFoundError("Track not found");
    if (grade.stageId !== track.stageId)
      throw new ValidationError("Track and grade level belong to different stages");
    const existing = await tx.gradeLevelTrack.findUnique({
      where: { gradeLevelId_trackId: { gradeLevelId, trackId } },
    });
    if (existing) throw new ConflictError("Track already linked to this grade level");
    return tx.gradeLevelTrack.create({ data: { gradeLevelId, trackId } });
  });
}

export function unlinkGradeTrack(id: string) {
  return platformDb(async (tx) => {
    if (!(await tx.gradeLevelTrack.findUnique({ where: { id } }))) throw new NotFoundError("Link not found");
    await tx.gradeLevelTrack.delete({ where: { id } });
    return { deleted: true };
  });
}


export function listSubjects(filter?: { isAzhari?: boolean; isSecondLanguage?: boolean }) {
  return platformDb((tx) =>
    tx.subject.findMany({
      where: filter,
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { offerings: true, teacherSubjects: true } } },
    }),
  );
}

export function createSubject(
  data: BaseCreate & { language?: Locale; isAzhari?: boolean; isSecondLanguage?: boolean },
) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.subject.findUnique({ where: { code: data.code } }), data.code);
    return tx.subject.create({ data });
  });
}

export function updateSubject(
  id: string,
  data: BasePatch & { language?: Locale; isAzhari?: boolean; isSecondLanguage?: boolean },
) {
  return platformDb(async (tx) => {
    if (!(await tx.subject.findUnique({ where: { id } }))) throw new NotFoundError("Subject not found");
    return tx.subject.update({ where: { id }, data });
  });
}


export function listOfferings(filter?: { subjectId?: string; gradeLevelId?: string; trackId?: string }) {
  return platformDb((tx) =>
    tx.subjectOffering.findMany({
      where: {
        subjectId: filter?.subjectId,
        gradeLevelId: filter?.gradeLevelId,
        trackId: filter?.trackId,
      },
      orderBy: [{ gradeLevelId: "asc" }, { createdAt: "asc" }],
      include: {
        subject: { select: { id: true, code: true, nameAr: true, isAzhari: true } },
        gradeLevel: {
          select: { id: true, code: true, nameAr: true, stage: { select: { nameAr: true, system: { select: { nameAr: true } } } } },
        },
        track: { select: { id: true, code: true, nameAr: true } },
      },
    }),
  );
}

export function createOffering(data: { subjectId: string; gradeLevelId: string; trackId?: string | null }) {
  return platformDb(async (tx) => {
    const trackId = data.trackId ?? null;
    const [subject, grade] = await Promise.all([
      tx.subject.findUnique({ where: { id: data.subjectId }, select: { id: true } }),
      tx.gradeLevel.findUnique({ where: { id: data.gradeLevelId }, select: { stageId: true } }),
    ]);
    if (!subject) throw new NotFoundError("Subject not found");
    if (!grade) throw new NotFoundError("Grade level not found");
    if (trackId) {
      const track = await tx.track.findUnique({ where: { id: trackId }, select: { stageId: true } });
      if (!track) throw new NotFoundError("Track not found");
      if (track.stageId !== grade.stageId)
        throw new ValidationError("Track and grade level belong to different stages");
    }
    const dup = await tx.subjectOffering.findFirst({
      where: { subjectId: data.subjectId, gradeLevelId: data.gradeLevelId, trackId },
      select: { id: true },
    });
    if (dup) throw new ConflictError("Offering already exists");
    return tx.subjectOffering.create({ data: { ...data, trackId } });
  });
}

export function updateOffering(id: string, data: { isActive?: boolean }) {
  return platformDb(async (tx) => {
    if (!(await tx.subjectOffering.findUnique({ where: { id } }))) throw new NotFoundError("Offering not found");
    return tx.subjectOffering.update({ where: { id }, data });
  });
}

export function deleteOffering(id: string) {
  return platformDb(async (tx) => {
    if (!(await tx.subjectOffering.findUnique({ where: { id } }))) throw new NotFoundError("Offering not found");
    await tx.subjectOffering.delete({ where: { id } });
    return { deleted: true };
  });
}


export function listSubjectRequests(status?: "pending" | "approved" | "rejected") {
  return platformDb(async (tx) => {
    const requests = await tx.subjectRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const userIds = [...new Set(requests.map((r) => r.requestedById))];
    const users = await tx.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    return requests.map((r) => ({ ...r, requestedBy: byId.get(r.requestedById) ?? null }));
  });
}

export function approveSubjectRequest(
  id: string,
  adminId: string,
  resolution: { subjectId?: string; newSubject?: { code: string; nameAr: string; nameEn?: string; isAzhari?: boolean } },
) {
  return platformDb(async (tx) => {
    const request = await tx.subjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Subject request not found");
    if (request.status !== "pending") throw new ConflictError("Request already reviewed");

    let subjectId = resolution.subjectId ?? null;
    if (resolution.newSubject) {
      const dup = await tx.subject.findUnique({ where: { code: resolution.newSubject.code } });
      if (dup) throw new ConflictError(`code '${resolution.newSubject.code}' already exists`);
      const created = await tx.subject.create({ data: resolution.newSubject });
      subjectId = created.id;
    } else if (subjectId) {
      if (!(await tx.subject.findUnique({ where: { id: subjectId } }))) throw new NotFoundError("Subject not found");
    } else {
      throw new ValidationError("Provide subjectId or newSubject");
    }

    return tx.subjectRequest.update({
      where: { id },
      data: { status: "approved", reviewedBy: adminId, reviewedAt: new Date(), createdSubjectId: subjectId },
    });
  });
}

export function rejectSubjectRequest(id: string, adminId: string, reviewNote?: string) {
  return platformDb(async (tx) => {
    const request = await tx.subjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Subject request not found");
    if (request.status !== "pending") throw new ConflictError("Request already reviewed");
    return tx.subjectRequest.update({
      where: { id },
      data: { status: "rejected", reviewedBy: adminId, reviewedAt: new Date(), reviewNote },
    });
  });
}
