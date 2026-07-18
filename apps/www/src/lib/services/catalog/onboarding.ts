import { platformDb } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import { NotFoundError, ValidationError, ForbiddenError } from "@/lib/errors/classes";
import { Prisma } from "@repo/database";


export function getOnboardingState(user: SessionUser) {
  return platformDb(async (tx) => {
    if (user.role === "student") {
      const profile = await tx.studentProfile.findUnique({
        where: { userId: user.id },
        select: {
          onboardingCompleted: true,
          onboardingDraft: true,
          educationSystemId: true,
          stageId: true,
          gradeLevelId: true,
          trackId: true,
          secondLanguageSubjectId: true,
          educationSystem: { select: { nameAr: true, nameEn: true } },
          gradeLevel: { select: { nameAr: true, nameEn: true } },
          track: { select: { nameAr: true, nameEn: true } },
          secondLanguageSubject: { select: { nameAr: true, nameEn: true } },
        },
      });
      if (!profile) throw new NotFoundError("Student profile not found");
      return { role: "student" as const, ...profile };
    }

    if (user.role === "teacher") {
      const profile = await tx.teacherProfile.findUnique({
        where: { userId: user.id },
        select: {
          onboardingCompleted: true,
          onboardingDraft: true,
          gradeLevels: { select: { gradeLevelId: true } },
          subjectRefs: { select: { subjectId: true } },
        },
      });
      if (!profile) throw new NotFoundError("Teacher profile not found");
      return {
        role: "teacher" as const,
        onboardingCompleted: profile.onboardingCompleted,
        onboardingDraft: profile.onboardingDraft,
        gradeLevelIds: profile.gradeLevels.map((g) => g.gradeLevelId),
        subjectIds: profile.subjectRefs.map((s) => s.subjectId),
      };
    }

    if (user.role === "center_admin") {
      if (!user.centerId) return { role: "center_admin" as const, onboardingCompleted: true };
      const center = await tx.center.findUnique({
        where: { id: user.centerId },
        select: {
          onboardingCompleted: true,
          onboardingDraft: true,
          name: true,
          governorate: true,
          area: true,
          phone: true,
          centerStages: { select: { stageId: true } },
        },
      });
      if (!center) throw new NotFoundError("Center not found");
      return {
        role: "center_admin" as const,
        onboardingCompleted: center.onboardingCompleted,
        onboardingDraft: center.onboardingDraft,
        center: { name: center.name, governorate: center.governorate, area: center.area, phone: center.phone },
        stageIds: center.centerStages.map((s) => s.stageId),
      };
    }

    return { role: user.role, onboardingCompleted: true };
  });
}


export function saveOnboardingDraft(user: SessionUser, draft: Prisma.InputJsonValue) {
  return platformDb(async (tx) => {
    if (user.role === "student") {
      await tx.studentProfile.update({ where: { userId: user.id }, data: { onboardingDraft: draft } });
    } else if (user.role === "teacher") {
      await tx.teacherProfile.update({ where: { userId: user.id }, data: { onboardingDraft: draft } });
    } else if (user.role === "center_admin" && user.centerId) {
      await tx.center.update({ where: { id: user.centerId }, data: { onboardingDraft: draft } });
    } else {
      throw new ForbiddenError("No onboarding flow for this role");
    }
    return { saved: true };
  });
}


export type StudentOnboardingInput = {
  educationSystemId: string;
  stageId: string;
  gradeLevelId: string;
  trackId?: string | null;
  secondLanguageSubjectId?: string | null;
};

export function completeStudentOnboarding(user: SessionUser, input: StudentOnboardingInput) {
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    const grade = await tx.gradeLevel.findUnique({
      where: { id: input.gradeLevelId },
      select: {
        id: true,
        nameAr: true,
        isActive: true,
        stage: {
          select: { id: true, isActive: true, hasSecondLanguage: true, system: { select: { id: true, isActive: true } } },
        },
        gradeTracks: { where: { track: { isActive: true } }, select: { trackId: true } },
      },
    });
    if (!grade || !grade.isActive || !grade.stage.isActive || !grade.stage.system.isActive)
      throw new NotFoundError("Grade level not found");
    if (grade.stage.id !== input.stageId || grade.stage.system.id !== input.educationSystemId)
      throw new ValidationError("Selection chain mismatch (system/stage/grade)");

    const trackId = input.trackId ?? null;
    const allowedTracks = new Set(grade.gradeTracks.map((gt) => gt.trackId));
    if (allowedTracks.size > 0) {
      if (!trackId) throw new ValidationError("Track is required for this grade level");
      if (!allowedTracks.has(trackId)) throw new ValidationError("Track is not offered at this grade level");
    } else if (trackId) {
      throw new ValidationError("This grade level has no tracks");
    }

    const secondLanguageSubjectId = input.secondLanguageSubjectId ?? null;
    if (secondLanguageSubjectId) {
      if (!grade.stage.hasSecondLanguage)
        throw new ValidationError("This stage does not ask for a second language");
      const offering = await tx.subjectOffering.findFirst({
        where: {
          gradeLevelId: grade.id,
          isActive: true,
          subject: { is: { id: secondLanguageSubjectId, isSecondLanguage: true, isActive: true } },
          OR: [{ trackId: null }, ...(trackId ? [{ trackId }] : [])],
        },
        select: { id: true },
      });
      if (!offering) throw new ValidationError("Second language is not offered for this selection");
    }

    const updated = await tx.studentProfile.update({
      where: { userId: user.id },
      data: {
        educationSystemId: input.educationSystemId,
        stageId: input.stageId,
        gradeLevelId: input.gradeLevelId,
        trackId,
        secondLanguageSubjectId,
        onboardingCompleted: true,
        onboardingDraft: Prisma.DbNull,
        grade: grade.nameAr,
      },
      select: { onboardingCompleted: true, gradeLevelId: true, trackId: true },
    });
    return updated;
  });
}


export type TeacherOnboardingInput = {
  gradeLevelIds: string[];
  subjectIds: string[];
};

export function completeTeacherOnboarding(user: SessionUser, input: TeacherOnboardingInput) {
  return platformDb(async (tx) => {
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("Teacher profile not found");

    const gradeLevelIds = [...new Set(input.gradeLevelIds)];
    const subjectIds = [...new Set(input.subjectIds)];
    if (gradeLevelIds.length === 0) throw new ValidationError("Select at least one grade level");
    if (subjectIds.length === 0) throw new ValidationError("Select at least one subject");

    const grades = await tx.gradeLevel.findMany({
      where: { id: { in: gradeLevelIds }, isActive: true },
      select: { id: true, nameAr: true },
    });
    if (grades.length !== gradeLevelIds.length) throw new NotFoundError("Grade level not found");

    const offered = await tx.subjectOffering.findMany({
      where: { gradeLevelId: { in: gradeLevelIds }, subjectId: { in: subjectIds }, isActive: true },
      select: { subjectId: true },
      distinct: ["subjectId"],
    });
    const offeredSet = new Set(offered.map((o) => o.subjectId));
    const notOffered = subjectIds.filter((id) => !offeredSet.has(id));
    if (notOffered.length > 0)
      throw new ValidationError("Some subjects are not offered in the selected grade levels");

    const subjects = await tx.subject.findMany({
      where: { id: { in: subjectIds }, isActive: true },
      select: { id: true, nameAr: true, nameEn: true },
    });
    if (subjects.length !== subjectIds.length) throw new NotFoundError("Subject not found");

    await tx.teacherGradeLevel.deleteMany({ where: { teacherId: user.id } });
    await tx.teacherSubject.deleteMany({ where: { teacherId: user.id } });
    await tx.teacherGradeLevel.createMany({
      data: gradeLevelIds.map((gradeLevelId) => ({ teacherId: user.id, gradeLevelId })),
    });
    await tx.teacherSubject.createMany({
      data: subjectIds.map((subjectId) => ({ teacherId: user.id, subjectId })),
    });
    await tx.teacherProfile.update({
      where: { userId: user.id },
      data: {
        onboardingCompleted: true,
        onboardingDraft: Prisma.DbNull,
        subjects: subjects.map((s) => s.nameEn ?? s.nameAr),
      },
    });
    return { onboardingCompleted: true, gradeLevelIds, subjectIds };
  });
}


export type CenterOnboardingInput = {
  name?: string;
  governorate?: string | null;
  area?: string | null;
  phone?: string | null;
  stageIds: string[];
};

// Center onboarding (§6): center data + covered stages (multi-select from the
// same catalog). Replace-style save on center_stages.
export function completeCenterOnboarding(user: SessionUser, input: CenterOnboardingInput) {
  return platformDb(async (tx) => {
    if (user.role !== "center_admin" || !user.centerId)
      throw new ForbiddenError("Center onboarding requires a center admin");
    const center = await tx.center.findUnique({ where: { id: user.centerId }, select: { id: true } });
    if (!center) throw new NotFoundError("Center not found");

    const stageIds = [...new Set(input.stageIds)];
    if (stageIds.length === 0) throw new ValidationError("Select at least one stage");
    const stages = await tx.stage.findMany({
      where: { id: { in: stageIds }, isActive: true },
      select: { id: true },
    });
    if (stages.length !== stageIds.length) throw new NotFoundError("Stage not found");

    await tx.centerStage.deleteMany({ where: { centerId: center.id } });
    await tx.centerStage.createMany({ data: stageIds.map((stageId) => ({ centerId: center.id, stageId })) });
    await tx.center.update({
      where: { id: center.id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        governorate: input.governorate ?? null,
        area: input.area ?? null,
        phone: input.phone ?? null,
        onboardingCompleted: true,
        onboardingDraft: Prisma.DbNull,
      },
    });
    return { onboardingCompleted: true, stageIds };
  });
}

export function createSubjectRequest(
  user: SessionUser,
  input: { suggestedName: string; gradeLevelId?: string | null; notes?: string | null },
) {
  return platformDb(async (tx) => {
    if (input.gradeLevelId) {
      const grade = await tx.gradeLevel.findUnique({ where: { id: input.gradeLevelId }, select: { id: true } });
      if (!grade) throw new NotFoundError("Grade level not found");
    }
    const existing = await tx.subjectRequest.findFirst({
      where: { requestedById: user.id, suggestedName: input.suggestedName, status: "pending" },
      select: { id: true },
    });
    if (existing) return { id: existing.id, duplicate: true };
    const created = await tx.subjectRequest.create({
      data: {
        requestedById: user.id,
        suggestedName: input.suggestedName,
        gradeLevelId: input.gradeLevelId ?? null,
        notes: input.notes ?? null,
      },
      select: { id: true, status: true },
    });
    return created;
  });
}
