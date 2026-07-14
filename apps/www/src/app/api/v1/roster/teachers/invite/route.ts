import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ConflictError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
import { notify } from "@/lib/services/notifications/notify";
import { sendMail } from "@/lib/mail/send";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).optional(),
  createShell: z.boolean().optional(),
});

const INVITE_EXPIRY_DAYS = 30;
const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = withErrors(async (req) => {
  const adminUser = await requireRole("center_admin");
  const { email, name } = await parseJson(req, bodySchema);

  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);

  const { teacher, affiliation, existingUserId } = await scopedDb(adminUser, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { email, status: { not: "deleted" } },
    });

    if (existing && existing.role !== "teacher") {
      throw new ConflictError("Email exists with a different role");
    }

    if (existing) {
      const activeAffiliation = await tx.centerTeacherAffiliation.findFirst({
        where: {
          centerId: adminUser.centerId as string,
          teacherId: existing.id,
          status: { in: ["pending", "active"] },
        },
      });
      if (activeAffiliation)
        throw new ConflictError("Teacher already has an active or pending affiliation");
    }

    const teacherUser =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          role: "teacher",
          status: "shell",
          passwordHash: null,
        },
      }));

    const newAffiliation = await tx.centerTeacherAffiliation.create({
      data: {
        centerId: adminUser.centerId as string,
        teacherId: teacherUser.id,
        status: "pending",
        invitedAt: new Date(),
        expiresAt,
      },
    });

    await tx.inviteToken.create({
      data: {
        email,
        tokenHash,
        purpose: "teacher_activation",
        centerId: adminUser.centerId,
        expiresAt,
      },
    });

    return {
      teacher: teacherUser,
      affiliation: newAffiliation,
      existingUserId: existing ? existing.id : null,
    };
  });

  if (existingUserId) {
    await notify(
      {
        recipients: [existingUserId],
        type: "teacher_invited",
        title: "Center invitation",
        body: "You have been invited to join a center as a teacher.",
        data: { centerId: adminUser.centerId },
      },
      {
        to: email,
        subject: "You have been invited to teach at a center",
        text: `Use this token to accept: ${token}`,
      },
    );
  } else {
    await sendMail({
      to: email,
      subject: "You have been invited to teach at a center",
      text: `Use this token to activate your account: ${token}`,
    }).catch(() => {});
  }

  return ok(
    {
      invited: true,
      existingUser: !!existingUserId,
      user: {
        id: teacher.id,
        email: teacher.email,
        status: teacher.status,
        role: teacher.role,
        name: teacher.name,
      },
      affiliation: {
        id: affiliation.id,
        status: affiliation.status,
      },
    },
    {
      status: 201,
      meta: LEAK_TOKEN ? { inviteToken: token } : undefined,
    },
  );
});
