import { platformDb, scopedDb, type TenantTx } from "@/lib/db/scope";
import type { SessionUser } from "@/lib/auth/session";
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "@/lib/errors/classes";
import type { PublicHandleKind } from "@repo/database";
import { handleProblem, normalizeHandle, type HandleProblem } from "./handle-rules";

// Who owns a handle is decided from the SESSION, never from the body: a
// centre admin can only ever name their own centre, a teacher only their own
// profile. Assistants and centre staff are deliberately excluded — the
// handle is the tenant's public name, closer to the login email than to a
// roster edit, and neither delegation grants identity.
export type HandleOwner =
  | { kind: "center"; centerId: string }
  | { kind: "teacher"; teacherProfileId: string };

export async function resolveHandleOwner(tx: TenantTx, user: SessionUser): Promise<HandleOwner> {
  if (user.role === "center_admin") {
    if (!user.centerId) throw new ForbiddenError("No center on this session");
    return { kind: "center", centerId: user.centerId };
  }
  if (user.role === "teacher") {
    const profile = await tx.teacherProfile.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!profile) throw new NotFoundError("Teacher profile not found");
    return { kind: "teacher", teacherProfileId: profile.id };
  }
  throw new ForbiddenError("Only a center admin or a teacher owns a public handle", {
    reason: "role_mismatch",
    role: user.role,
  });
}

function ownerWhere(owner: HandleOwner) {
  return owner.kind === "center"
    ? { centerId: owner.centerId }
    : { teacherProfileId: owner.teacherProfileId };
}

export type MyHandle = { kind: PublicHandleKind; handle: string | null };

export async function getMyHandle(user: SessionUser): Promise<MyHandle> {
  return scopedDb(user, async (tx) => {
    const owner = await resolveHandleOwner(tx, user);
    const row = await tx.publicHandle.findUnique({
      where: ownerWhere(owner),
      select: { handle: true },
    });
    return { kind: owner.kind, handle: row?.handle ?? null };
  });
}

export type Availability = {
  handle: string;
  available: boolean;
  problem: HandleProblem | "taken" | null;
};

// "Available" means: valid, not reserved, and either unowned or owned by
// this same owner (so re-saving your own handle is not reported as taken).
export async function checkHandleAvailability(
  user: SessionUser,
  raw: string,
): Promise<Availability> {
  const handle = normalizeHandle(raw);
  const problem = handleProblem(handle);
  if (problem) return { handle, available: false, problem };

  return scopedDb(user, async (tx) => {
    const owner = await resolveHandleOwner(tx, user);
    const row = await tx.publicHandle.findUnique({
      where: { handle },
      select: { centerId: true, teacherProfileId: true },
    });
    if (!row) return { handle, available: true, problem: null };
    const mine =
      owner.kind === "center"
        ? row.centerId === owner.centerId
        : row.teacherProfileId === owner.teacherProfileId;
    return { handle, available: mine, problem: mine ? null : "taken" };
  });
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "P2002");
}

export async function setMyHandle(user: SessionUser, raw: string): Promise<MyHandle> {
  const handle = normalizeHandle(raw);
  const problem = handleProblem(handle);
  if (problem) {
    throw new BusinessRuleError("Invalid public handle", { reason: problem, handle });
  }

  return scopedDb(user, async (tx) => {
    const owner = await resolveHandleOwner(tx, user);
    const where = ownerWhere(owner);
    try {
      const before = await tx.publicHandle.findFirst({ where, select: { handle: true } });
      const row = await tx.publicHandle.upsert({
        where,
        create: { handle, kind: owner.kind, ...where },
        update: { handle },
        select: { handle: true },
      });
      // DIFF-07: a public name change is a small identity event — audited.
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "public_handle.set",
          targetType: owner.kind === "center" ? "center" : "teacher_profile",
          targetId: owner.kind === "center" ? owner.centerId : owner.teacherProfileId,
          centerId: owner.kind === "center" ? owner.centerId : null,
          beforeState: { handle: before?.handle ?? null },
          afterState: { handle: row.handle },
        },
      });
      return { kind: owner.kind, handle: row.handle };
    } catch (err) {
      // The UNIQUE on `handle` is the single rule that forbids a centre and a
      // teacher from sharing a name; every caller relies on it, not on a
      // read-then-write.
      if (isUniqueViolation(err)) {
        throw new ConflictError("This public handle is already taken", {
          reason: "taken",
          handle,
        });
      }
      throw err;
    }
  });
}

export async function clearMyHandle(user: SessionUser): Promise<MyHandle> {
  return scopedDb(user, async (tx) => {
    const owner = await resolveHandleOwner(tx, user);
    const where = ownerWhere(owner);
    const before = await tx.publicHandle.findFirst({ where, select: { handle: true } });
    await tx.publicHandle.deleteMany({ where });
    if (before) {
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "public_handle.cleared",
          targetType: owner.kind === "center" ? "center" : "teacher_profile",
          targetId: owner.kind === "center" ? owner.centerId : owner.teacherProfileId,
          centerId: owner.kind === "center" ? owner.centerId : null,
          beforeState: { handle: before.handle },
          afterState: { handle: null },
        },
      });
    }
    return { kind: owner.kind, handle: null };
  });
}

// The owner behind a handle, or null. Read on the platform scope because the
// caller is the public page (no session) or the edge resolver.
export async function findHandleOwner(raw: string): Promise<
  | { kind: "center"; handle: string; centerId: string }
  | { kind: "teacher"; handle: string; teacherUserId: string }
  | null
> {
  const handle = normalizeHandle(raw);
  if (handleProblem(handle)) return null;
  return platformDb(async (tx) => {
    const row = await tx.publicHandle.findUnique({
      where: { handle },
      select: {
        handle: true,
        kind: true,
        centerId: true,
        teacherProfile: { select: { userId: true } },
      },
    });
    if (!row) return null;
    if (row.kind === "center" && row.centerId) {
      return { kind: "center", handle: row.handle, centerId: row.centerId };
    }
    if (row.kind === "teacher" && row.teacherProfile) {
      return { kind: "teacher", handle: row.handle, teacherUserId: row.teacherProfile.userId };
    }
    return null;
  });
}
