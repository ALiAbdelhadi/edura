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
});

const INVITE_EXPIRY_HOURS = 7 * 24;

export const POST = withErrors(async (req) => {
  const adminUser = await requireRole("center_admin");
  const { email } = await parseJson(req, bodySchema);

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const { existingUserId } = await scopedDb(adminUser, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { email, status: { not: "deleted" } },
    });

    if (existing) {
      if (existing.status !== "shell") {
        const alreadyAdmin = await tx.centerAdminProfile.findFirst({
          where: { userId: existing.id, centerId: adminUser.centerId as string },
        });
        if (alreadyAdmin) throw new ConflictError("User is already an admin of this center");
      }
      await tx.inviteToken.create({
        data: {
          email,
          tokenHash,
          purpose: "admin_invite",
          centerId: adminUser.centerId as string,
          expiresAt,
        },
      });
      return { existingUserId: existing.id };
    }

    await tx.user.create({
      data: {
        email,
        role: "center_admin",
        name: email.split("@")[0] as string,
        status: "shell",
        passwordHash: null,
      },
    });

    await tx.inviteToken.create({
      data: {
        email,
        tokenHash,
        purpose: "admin_invite",
        centerId: adminUser.centerId as string,
        expiresAt,
      },
    });

    return { existingUserId: null };
  });

  if (existingUserId) {
    await notify(
      {
        recipients: [existingUserId],
        type: "shell_activation_invite",
        title: "Center admin invite",
        body: "You have been invited to become an admin of a center.",
        data: { centerId: adminUser.centerId },
      },
      {
        to: email,
        subject: "You have been invited to join as a center admin",
        text: `Use this token to accept: ${token}`,
      },
    );
    return ok({ invited: true, existingUser: true });
  }

  await sendMail({
    to: email,
    subject: "You have been invited to join as a center admin",
    text: `Use this token to activate your account: ${token}`,
  }).catch(() => {});

  return ok({ invited: true, existingUser: false }, { status: 201 });
});
