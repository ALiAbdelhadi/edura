import type { InvitePurpose, Role } from "@repo/database";
import { platformDb } from "../../db/scope";
import { generateOpaqueToken, hashToken } from "../../utils/random";
import { appBaseUrl } from "../../http/app-url";

export type ClaimPurpose =
  | "walk_in_onboarding"
  | "assistant_invite"
  | "center_staff_invite"
  | "teacher_invite";

export type ClaimSpec = {
  role: Role;
  landing: string;
  emailIsChosen: boolean;
};

export const CLAIMABLE: Readonly<Record<ClaimPurpose, ClaimSpec>> = {
  walk_in_onboarding: { role: "student", landing: "/onboarding", emailIsChosen: true },
  assistant_invite: {
    role: "assistant",
    landing: "/dashboard/assistant",
    emailIsChosen: false,
  },
  center_staff_invite: {
    role: "center_staff",
    landing: "/dashboard/staff",
    emailIsChosen: false,
  },
  teacher_invite: {
    role: "teacher",
    landing: "/dashboard/teacher",
    emailIsChosen: false,
  },
};

export function isClaimPurpose(value: string): value is ClaimPurpose {
  return Object.prototype.hasOwnProperty.call(CLAIMABLE, value);
}

export function inviteTtlMs(): number {
  const hours =
    Number(process.env.INVITE_TOKEN_TTL_HOURS) ||
    Number(process.env.WALKIN_TOKEN_TTL_HOURS) ||
    168;
  return hours * 60 * 60 * 1000;
}

export { appBaseUrl };

export function claimLink(token: string, locale: "ar" | "en" = "ar"): string {
  return `${appBaseUrl()}/${locale}/claim?token=${token}`;
}

export function redactToken(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9._~-]+/g, "$1***");
}

export async function issueInvite(input: {
  userId: string;
  purpose: ClaimPurpose;
  centerId?: string | null;
  email?: string | null;
  actorId: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + inviteTtlMs());

  await platformDb(
    async (tx) => {
      await tx.inviteToken.updateMany({
        where: { userId: input.userId, purpose: input.purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.inviteToken.create({
        data: {
          userId: input.userId,
          email: input.email ?? null,
          centerId: input.centerId ?? null,
          purpose: input.purpose as InvitePurpose,
          tokenHash: hashToken(token),
          expiresAt,
        },
      });
    },
    { actorId: input.actorId },
  );

  return { token, expiresAt };
}
