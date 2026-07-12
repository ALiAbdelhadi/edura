import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/requireRole";
import { scopedDb } from "@/lib/db/scope";
import { ConflictError, BusinessRuleError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { generateOpaqueToken, hashToken } from "@/lib/utils/random";
import { sendMail } from "@/lib/mail/send";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  name: z.string().trim().min(1).optional(),
});

const INVITE_EXPIRY_DAYS = 30;
const LEAK_TOKEN = process.env.NODE_ENV !== "production" || process.env.E2E === "1";

export const POST = withErrors(async (req) => {
  const admin = await requireRole("center_admin");
  const { email, name } = await parseJson(req, bodySchema);

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  const shell = await scopedDb(admin, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { email, status: { not: "deleted" } },
    });
    if (existing && existing.status !== "shell") {
      throw new BusinessRuleError("Active user with this email exists; use lookup instead");
    }
    if (existing && existing.status === "shell") {
      const pendingInvite = await tx.inviteToken.findFirst({
        where: {
          email,
          purpose: "student_activation",
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
      });
      if (pendingInvite) throw new ConflictError("Pending invite already exists for this email");
    }

    const shellUser =
      existing ??
      (await tx.user.create({
        data: {
          email,
          name: name ?? email.split("@")[0],
          role: "student",
          status: "shell",
          passwordHash: null,
        },
      }));

    await tx.centerStudentRoster.upsert({
      where: {
        centerId_studentId: { centerId: admin.centerId as string, studentId: shellUser.id },
      },
      create: {
        centerId: admin.centerId as string,
        studentId: shellUser.id,
        addedAt: new Date(),
      },
      update: {},
    });

    await tx.inviteToken.create({
      data: {
        email,
        tokenHash,
        purpose: "student_activation",
        centerId: admin.centerId,
        expiresAt,
      },
    });

    return shellUser;
  });

  await sendMail({
    to: email,
    subject: "You have been invited to join as a student",
    text: `Use this token to activate your account: ${token}`,
  }).catch(() => {});

  return ok(
    {
      invited: true,
      user: {
        id: shell.id,
        email: shell.email,
        status: shell.status,
        name: shell.name,
        role: shell.role,
      },
    },
    {
      status: 201,
      meta: LEAK_TOKEN ? { inviteToken: token } : undefined,
    },
  );
});
