import { platformDb } from "../../db/scope";
import { writeAdminAudit } from "../../audit/admin-audit";
import type { SessionUser } from "../../auth/types";
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

export function createSystem(data: BaseCreate & { iconKey?: string }, actor: SessionUser) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.educationSystem.findUnique({ where: { code: data.code } }), data.code);
    const row = await tx.educationSystem.create({ data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.system_created",
      targetType: "education_system",
      targetId: row.id,
      after: { ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateSystem(id: string, data: BasePatch & { iconKey?: string }, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.educationSystem.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("System not found");
    const row = await tx.educationSystem.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.system_updated",
      targetType: "education_system",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
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

export function createStage(
  data: BaseCreate & { educationSystemId: string; hasSecondLanguage?: boolean },
  actor: SessionUser,
) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.stage.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.educationSystem.findUnique({ where: { id: data.educationSystemId } })))
      throw new NotFoundError("Education system not found");
    const row = await tx.stage.create({ data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.stage_created",
      targetType: "stage",
      targetId: row.id,
      after: { ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateStage(
  id: string,
  data: BasePatch & { hasSecondLanguage?: boolean },
  actor: SessionUser,
) {
  return platformDb(async (tx) => {
    const before = await tx.stage.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Stage not found");
    const row = await tx.stage.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.stage_updated",
      targetType: "stage",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
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

export function createGradeLevel(
  data: BaseCreate & { stageId: string; level: number },
  actor: SessionUser,
) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.gradeLevel.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.stage.findUnique({ where: { id: data.stageId } }))) throw new NotFoundError("Stage not found");
    const row = await tx.gradeLevel.create({ data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.grade_level_created",
      targetType: "grade_level",
      targetId: row.id,
      after: { ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateGradeLevel(id: string, data: BasePatch & { level?: number }, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.gradeLevel.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Grade level not found");
    const row = await tx.gradeLevel.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.grade_level_updated",
      targetType: "grade_level",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
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

export function createTrack(data: BaseCreate & { stageId: string }, actor: SessionUser) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.track.findUnique({ where: { code: data.code } }), data.code);
    if (!(await tx.stage.findUnique({ where: { id: data.stageId } }))) throw new NotFoundError("Stage not found");
    const row = await tx.track.create({ data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.track_created",
      targetType: "track",
      targetId: row.id,
      after: { ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateTrack(id: string, data: BasePatch, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.track.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Track not found");
    const row = await tx.track.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.track_updated",
      targetType: "track",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function linkGradeTrack(gradeLevelId: string, trackId: string, actor: SessionUser) {
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
    const row = await tx.gradeLevelTrack.create({ data: { gradeLevelId, trackId } });
    await writeAdminAudit(tx, actor, {
      action: "catalog.grade_track_linked",
      targetType: "grade_level_track",
      targetId: row.id,
      after: { gradeLevelId, trackId },
    });
    return row;
  }, { actorId: actor.id });
}

export function unlinkGradeTrack(id: string, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.gradeLevelTrack.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Link not found");
    await tx.gradeLevelTrack.delete({ where: { id } });
    await writeAdminAudit(tx, actor, {
      action: "catalog.grade_track_unlinked",
      targetType: "grade_level_track",
      targetId: id,
      before,
      after: { deleted: true },
    });
    return { deleted: true };
  }, { actorId: actor.id });
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
  actor: SessionUser,
) {
  return platformDb(async (tx) => {
    await assertUniqueCode(tx, () => tx.subject.findUnique({ where: { code: data.code } }), data.code);
    const row = await tx.subject.create({ data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.subject_created",
      targetType: "subject",
      targetId: row.id,
      after: { ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateSubject(
  id: string,
  data: BasePatch & { language?: Locale; isAzhari?: boolean; isSecondLanguage?: boolean },
  actor: SessionUser,
) {
  return platformDb(async (tx) => {
    const before = await tx.subject.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Subject not found");
    const row = await tx.subject.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.subject_updated",
      targetType: "subject",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
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

export function createOffering(
  data: { subjectId: string; gradeLevelId: string; trackId?: string | null },
  actor: SessionUser,
) {
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
    const row = await tx.subjectOffering.create({ data: { ...data, trackId } });
    await writeAdminAudit(tx, actor, {
      action: "catalog.offering_created",
      targetType: "subject_offering",
      targetId: row.id,
      after: { ...data, trackId },
    });
    return row;
  }, { actorId: actor.id });
}

export function updateOffering(id: string, data: { isActive?: boolean }, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.subjectOffering.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Offering not found");
    const row = await tx.subjectOffering.update({ where: { id }, data });
    await writeAdminAudit(tx, actor, {
      action: "catalog.offering_updated",
      targetType: "subject_offering",
      targetId: id,
      before,
      after: { changed: Object.keys(data), ...data },
    });
    return row;
  }, { actorId: actor.id });
}

export function deleteOffering(id: string, actor: SessionUser) {
  return platformDb(async (tx) => {
    const before = await tx.subjectOffering.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Offering not found");
    await tx.subjectOffering.delete({ where: { id } });
    await writeAdminAudit(tx, actor, {
      action: "catalog.offering_deleted",
      targetType: "subject_offering",
      targetId: id,
      before,
      after: { deleted: true, hardDelete: true },
    });
    return { deleted: true };
  }, { actorId: actor.id });
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
  actor: SessionUser,
  resolution: { subjectId?: string; newSubject?: { code: string; nameAr: string; nameEn?: string; isAzhari?: boolean } },
) {
  const adminId = actor.id;
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

    const row = await tx.subjectRequest.update({
      where: { id },
      data: { status: "approved", reviewedBy: adminId, reviewedAt: new Date(), createdSubjectId: subjectId },
    });
    await writeAdminAudit(tx, actor, {
      action: "catalog.subject_request_approved",
      targetType: "subject_request",
      targetId: id,
      before: { status: request.status, requestedById: request.requestedById },
      after: {
        status: "approved",
        subjectId,
        createdNewSubject: Boolean(resolution.newSubject),
      },
    });
    return row;
  }, { actorId: adminId });
}

export function rejectSubjectRequest(id: string, actor: SessionUser, reviewNote?: string) {
  return platformDb(async (tx) => {
    const request = await tx.subjectRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Subject request not found");
    if (request.status !== "pending") throw new ConflictError("Request already reviewed");
    const row = await tx.subjectRequest.update({
      where: { id },
      data: { status: "rejected", reviewedBy: actor.id, reviewedAt: new Date(), reviewNote },
    });
    await writeAdminAudit(tx, actor, {
      action: "catalog.subject_request_rejected",
      targetType: "subject_request",
      targetId: id,
      before: { status: request.status, requestedById: request.requestedById },
      after: { status: "rejected", reviewNote: reviewNote ?? null },
    });
    return row;
  }, { actorId: actor.id });
}
