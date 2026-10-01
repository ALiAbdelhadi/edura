import bcrypt from "bcryptjs";

import { platformDb, type TenantTx } from "../../db/scope";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { writeAdminAudit as writeAudit } from "../../audit/admin-audit";
import { setUserSuspended } from "./admin-users";
import { deleteReplacedImage, imageSlot } from "../../media/images";
import type { Prisma } from "@repo/database";

/**
 * The teacher counterpart of `center-control.ts`.
 *
 * Two rules govern this file, and both are load-bearing:
 *
 *  1. It NEVER writes `users.status`. A teacher is a `users` row, so the
 *     ACTIVE <-> SUSPENDED transition already has exactly one implementation
 *     (`setUserSuspended`), which refuses self-suspension, refuses a
 *     blacklisted account, requires a reason and writes the `user.suspended` /
 *     `user.reinstated` audit. `setTeacherStatus` below is a thin façade over
 *     it so the teacher surface reads like the centre surface -- it is a
 *     second DOOR, not a second MECHANISM. See the ONE SUSPENSION MECHANISM
 *     invariant in CLAUDE.md and tests/unit/teacher-one-suspension-path.test.ts.
 *
 *  2. The profile editor cannot reach status, role or attendance mode.
 *     `TEACHER_*_FIELDS` is the whitelist, mirroring `CENTER_PROFILE_FIELDS`;
 *     attendance mode keeps its own audited endpoint for the same reason.
 */

async function assertTeacher(tx: TenantTx, teacherUserId: string) {
  const user = await tx.user.findUnique({
    where: { id: teacherUserId },
    select: { id: true, name: true, email: true, role: true, status: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new NotFoundError("Teacher not found");
  if (user.role !== "teacher") {
    throw new BusinessRuleError(`User is a '${user.role}', not a teacher`);
  }
  return user;
}

export type TeacherInput = {
  name: string;
  email: string;
  password: string;
  phone?: string;
  bio?: string | null;
  subjects?: string[];
  qualifications?: string | null;
  experienceYears?: number;
  lessonPrice?: number | null;
  attendanceMode?: "counter_only" | "counter_and_door";
};

/**
 * Provisions a teacher account. Modelled on `createAccountant` -- the one
 * existing admin-creates-a-user path in this app -- because a second shape
 * would be a second thing to keep honest.
 *
 * The role is pinned here and never read from the request body: the form
 * cannot ask for a super admin. The `users` row and its `teacher_profiles` row
 * are created in ONE transaction, so a teacher with no profile (the state the
 * list screen renders as "no profile") can never be produced by this path.
 */
export function createTeacher(actor: SessionUser, input: TeacherInput) {
  return platformDb(
    async (tx) => {
      const existing = await tx.user.findFirst({
        where: {
          OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])],
        },
        select: { id: true },
      });
      if (existing) throw new ConflictError("An account with this email or phone already exists");

      const passwordHash = await bcrypt.hash(input.password, 10);
      const teacher = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          role: "teacher",
          status: "active",
          emailVerified: true,
        },
        select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true },
      });

      const profile = await tx.teacherProfile.create({
        data: {
          userId: teacher.id,
          bio: input.bio ?? null,
          subjects: input.subjects ?? [],
          qualifications: input.qualifications ?? null,
          experienceYears: input.experienceYears ?? 0,
          lessonPrice: input.lessonPrice ?? null,
          ...(input.attendanceMode ? { attendanceMode: input.attendanceMode } : {}),
        },
        select: {
          id: true,
          subjects: true,
          experienceYears: true,
          lessonPrice: true,
          attendanceMode: true,
        },
      });

      await writeAudit(tx, actor, {
        action: "teacher.created",
        targetType: "teacher",
        targetId: teacher.id,
        before: null,
        after: {
          name: teacher.name,
          email: teacher.email,
          phone: teacher.phone,
          role: teacher.role,
          status: teacher.status,
          passwordSet: true,
          emailVerified: true,
          profileId: profile.id,
          subjects: profile.subjects,
          experienceYears: profile.experienceYears,
          lessonPrice: profile.lessonPrice,
          attendanceMode: profile.attendanceMode,
        },
      });

      return { ...teacher, profile };
    },
    { actorId: actor.id },
  );
}

/** Editable on the `users` row. Deliberately excludes status and role. */
export const TEACHER_ACCOUNT_FIELDS = ["name", "phone", "email", "locale"] as const;

/**
 * Editable on the `teacher_profiles` row. Deliberately excludes
 * `attendanceMode` (its own audited endpoint), `systemStatus`, `accessLevel`,
 * `walletBalance` and every rating column -- money and reputation are not
 * profile text.
 */
export const TEACHER_PROFILE_FIELDS = [
  "bio",
  "subjects",
  "qualifications",
  "experienceYears",
  "photoUrl",
  "lessonPrice",
] as const;

export type TeacherProfilePatch = Partial<
  Record<
    (typeof TEACHER_ACCOUNT_FIELDS)[number] | (typeof TEACHER_PROFILE_FIELDS)[number],
    string | number | string[] | null
  >
>;

const ACCOUNT_KEYS = new Set<string>(TEACHER_ACCOUNT_FIELDS);
const PROFILE_KEYS = new Set<string>(TEACHER_PROFILE_FIELDS);

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

/**
 * The teacher counterpart of `updateCenterProfile`, and it works the same way:
 * an unknown key is REFUSED rather than ignored, a no-op patch reports
 * `changed: []` instead of writing, and every real change is audited with its
 * before/after.
 *
 * A teacher spans two tables, so the patch is split by whitelist and both
 * writes happen in one transaction.
 */
export async function updateTeacherProfile(
  teacherUserId: string,
  patch: TeacherProfilePatch,
  actor: SessionUser,
) {
  const keys = Object.keys(patch);
  const illegal = keys.filter((k) => !ACCOUNT_KEYS.has(k) && !PROFILE_KEYS.has(k));
  if (illegal.length) {
    throw new ForbiddenError(`These fields are not editable here: ${illegal.join(", ")}`);
  }
  if (!keys.length) throw new BusinessRuleError("Nothing to update");

  let previousPhotoUrl: string | null = null;
  const result = await platformDb(
    async (tx) => {
      const user = await assertTeacher(tx, teacherUserId);
      const full = await tx.user.findUnique({
        where: { id: teacherUserId },
        select: { id: true, name: true, phone: true, email: true, locale: true },
      });
      const profile = await tx.teacherProfile.findUnique({ where: { userId: teacherUserId } });
      previousPhotoUrl = profile?.photoUrl ?? null;

      const profileKeys = keys.filter((k) => PROFILE_KEYS.has(k));
      if (profileKeys.length && !profile) {
        throw new BusinessRuleError(
          "This teacher has no profile row — profile fields cannot be edited",
        );
      }

      const before: Record<string, unknown> = {};
      const after: Record<string, unknown> = {};
      const accountData: Prisma.UserUpdateInput = {};
      const profileData: Prisma.TeacherProfileUpdateInput = {};

      for (const k of keys) {
        const source = ACCOUNT_KEYS.has(k)
          ? (full as unknown as Record<string, unknown>)
          : (profile as unknown as Record<string, unknown>);
        const current = source?.[k];
        const next = patch[k as keyof TeacherProfilePatch];
        if (sameValue(current, next)) continue;
        before[k] = current ?? null;
        after[k] = next ?? null;
        if (ACCOUNT_KEYS.has(k)) (accountData as Record<string, unknown>)[k] = next;
        else (profileData as Record<string, unknown>)[k] = next;
      }

      if (!Object.keys(after).length) {
        return { id: teacherUserId, changed: [] as string[] };
      }

      // A teacher's email is their login. Colliding with a live account would
      // be caught by the unique index as a raw 500; refuse it by name instead.
      if (typeof after.email === "string") {
        const clash = await tx.user.findFirst({
          where: { email: after.email, id: { not: teacherUserId } },
          select: { id: true },
        });
        if (clash) throw new ConflictError("Another account already uses this email");
      }
      if (typeof after.phone === "string") {
        const clash = await tx.user.findFirst({
          where: { phone: after.phone, id: { not: teacherUserId } },
          select: { id: true },
        });
        if (clash) throw new ConflictError("Another account already uses this phone number");
      }

      if (Object.keys(accountData).length) {
        await tx.user.update({ where: { id: teacherUserId }, data: accountData });
      }
      if (Object.keys(profileData).length) {
        await tx.teacherProfile.update({ where: { userId: teacherUserId }, data: profileData });
      }

      await writeAudit(tx, actor, {
        action: "teacher.profile_updated",
        targetType: "teacher",
        targetId: teacherUserId,
        before,
        after,
      });

      const [updatedUser, updatedProfile] = await Promise.all([
        tx.user.findUnique({
          where: { id: teacherUserId },
          select: { id: true, name: true, email: true, phone: true, locale: true, status: true },
        }),
        tx.teacherProfile.findUnique({ where: { userId: teacherUserId } }),
      ]);

      return {
        id: teacherUserId,
        changed: Object.keys(after),
        teacher: {
          ...updatedUser,
          previousStatus: user.status,
          bio: updatedProfile?.bio ?? null,
          subjects: updatedProfile?.subjects ?? [],
          qualifications: updatedProfile?.qualifications ?? null,
          experienceYears: updatedProfile?.experienceYears ?? 0,
          photoUrl: updatedProfile?.photoUrl ?? null,
          lessonPrice: updatedProfile?.lessonPrice ?? null,
        },
      };
    },
    { actorId: actor.id },
  );

  if (result.changed.includes("photoUrl")) {
    await deleteReplacedImage(previousPhotoUrl, result.teacher?.photoUrl ?? null, {
      owned: imageSlot("avatar", teacherUserId),
    });
  }
  return result;
}

/**
 * The teacher activate/deactivate door, shaped like `setCenterStatus` so the
 * two detail screens can drive the same `ControlAction`.
 *
 * It writes NOTHING itself. `setUserSuspended` is the single implementation of
 * the ACTIVE <-> SUSPENDED transition for every `users` row, and it already
 * carries the reason requirement, the refuse-self rule, the blacklist refusal
 * and the audit. Suspension also bumps `users.token_version`, which the
 * `users_revoke_sessions` trigger keys on -- so a deactivated teacher is
 * signed out everywhere without this file arranging a cascade of its own.
 *
 * Unlike a centre, deactivating a teacher does NOT cascade to related records:
 * their courses, affiliations and assistants are left alone. See the note in
 * docs/decisions/ and the summary handed to the reviewer.
 */
export async function setTeacherStatus(
  teacherUserId: string,
  action: "activate" | "deactivate",
  reason: string | undefined,
  actor: SessionUser,
) {
  const previous = await platformDb(
    async (tx) => (await assertTeacher(tx, teacherUserId)).status,
    { actorId: actor.id },
  );

  const result = await setUserSuspended(actor, teacherUserId, action === "deactivate", reason);
  return { id: result.id, status: result.status, previousStatus: previous };
}
