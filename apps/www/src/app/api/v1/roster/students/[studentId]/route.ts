import { z } from "zod";
import { Prisma } from "@repo/database";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { centerStaff, RECEPTION, MANAGER } from "@/lib/authz/center-actor";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError, ConflictError, ForbiddenError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ studentId: string }> };

// GET (view) = receptionist+; PATCH (edit incl. blacklist toggle) = manager only
// — blacklisting is a manager capability, so it must not leak to a receptionist.
// DELETE (remove from roster) stays owner-only by omission.
export const GET = centerStaff(
  async (_req, ctx, { acting: user }) => {
    const { studentId } = await ctx.params;

    if (!user.centerId) throw new ForbiddenError("Admin has no center scope");

  const result = await scopedDb(user, async (tx) => {
    const roster = await tx.centerStudentRoster.findFirst({
      where: { studentId, centerId: user.centerId as string },
    });
    if (!roster) throw new NotFoundError("Student not in roster");

    const student = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });

    return { ...roster, user: student };
  });

    return ok(result);
  },
  { allow: RECEPTION },
);

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
  operationalParentName: z.string().optional(),
  operationalParentPhone: z.string().optional(),
  blacklisted: z.boolean().optional(),
  blacklistReason: z.string().optional(),
});

export const PATCH = centerStaff(
  async (req, ctx, { acting: user }) => {
    const { studentId } = await ctx.params;
    const body = await parseJson(req, patchSchema);

    if (!user.centerId) throw new ForbiddenError("Admin has no center scope");

  const result = await scopedDb(user, async (tx) => {
    const inRoster = await tx.centerStudentRoster.findFirst({
      where: { studentId, centerId: user.centerId as string, leftAt: null },
    });
    if (!inRoster) throw new NotFoundError("Student not in roster");

    const userUpdate: Prisma.UserUpdateInput = {};
    if (body.name !== undefined) userUpdate.name = body.name.trim();
    if (body.email !== undefined) {
      const normalizedEmail = body.email.toLowerCase().trim();
      const existing = await tx.user.findFirst({
        where: { email: normalizedEmail, id: { not: studentId } },
      });
      if (existing) throw new ConflictError("Email already in use");
      userUpdate.email = normalizedEmail;
    }
    if (body.phone !== undefined) userUpdate.phone = body.phone || null;

    if (Object.keys(userUpdate).length > 0) {
      await tx.user.update({ where: { id: studentId }, data: userUpdate });
    }

    const rosterUpdate: Prisma.CenterStudentRosterUpdateInput = {};
    if (body.operationalParentName !== undefined)
      rosterUpdate.operationalParentName = body.operationalParentName;
    if (body.operationalParentPhone !== undefined)
      rosterUpdate.operationalParentPhone = body.operationalParentPhone;
    if (body.blacklisted !== undefined) {
      rosterUpdate.blacklisted = body.blacklisted;
      if (body.blacklisted) {
        rosterUpdate.blacklistedAt = new Date();
        rosterUpdate.blacklistedBy = user.id;
        rosterUpdate.blacklistReason = body.blacklistReason ?? "";
      } else {
        rosterUpdate.blacklistedAt = null;
        rosterUpdate.blacklistedBy = null;
        rosterUpdate.blacklistReason = "";
      }
    }

    let roster: Awaited<ReturnType<typeof tx.centerStudentRoster.update>> | null = null;
    if (Object.keys(rosterUpdate).length > 0) {
      roster = await tx.centerStudentRoster.update({
        where: { centerId_studentId: { centerId: user.centerId as string, studentId } },
        data: rosterUpdate,
      });
    }

    const updatedUser = await tx.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true, phone: true, status: true },
    });

    return { ...(roster ?? {}), user: updatedUser };
  });

    return ok(result);
  },
  { allow: MANAGER },
);

export const DELETE = withErrors(async (_req, ctx) => {
  const user = await requireRole("center_admin");
  const { studentId } = await ctx.params;

  if (!user.centerId) throw new ForbiddenError("Admin has no center scope");

  await scopedDb(user, async (tx) => {
    const res = await tx.centerStudentRoster.updateMany({
      where: { studentId, leftAt: null, centerId: user.centerId as string },
      data: { leftAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundError("Student not in roster");
  });

  return ok({ removed: true });
});
