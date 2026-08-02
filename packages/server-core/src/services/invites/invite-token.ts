// =============================================================================
// The tokenized single-use claim — ONE module, three roles.
//
// This is Step 7's walk-in mechanism generalized, not a second system: same
// `invite_tokens` table, same 256-bit opaque token, same "only the SHA-256 hash
// ever persists", same atomic single-use consumption. The only thing that
// varies per role is the PURPOSE, and the purpose IS the authorization gate.
//
// CLAIMABLE is an exhaustive map from purpose -> the exactly-one role that
// purpose may resolve to, plus the account state it demands. It lives here and
// is read by the NextAuth claim provider, so a token minted for an assistant
// can never open a staff or student account — that is a table lookup, not a
// branch someone can forget to write.
// =============================================================================

import type { InvitePurpose, Role } from "@repo/database";
import { platformDb } from "../../db/scope";
import { generateOpaqueToken, hashToken } from "../../utils/random";

/** The purposes this claim flow serves. Other InvitePurpose values are NOT ours. */
export type ClaimPurpose =
  | "walk_in_onboarding"
  | "assistant_invite"
  | "center_staff_invite"
  | "teacher_invite";

export type ClaimSpec = {
  /** The ONE role a token of this purpose may ever resolve to. */
  role: Role;
  /** Where the claimant lands once credentials are set. */
  landing: string;
  /**
   * Does the claimant choose their own login email, or do they already have one
   * (they were invited AT an address, so it is fixed and shown read-only)?
   */
  emailIsChosen: boolean;
};

export const CLAIMABLE: Readonly<Record<ClaimPurpose, ClaimSpec>> = {
  // A phone-only walk-in student has no email yet — the claimant (usually the
  // guardian, see resolveStudentInviteRecipient) picks one.
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
  // An off-system teacher joining the platform. They were invited AT an
  // address the center holds for them, so the address is fixed — the same
  // reasoning as an assistant or a staff hire, and the opposite of a phone-only
  // walk-in student who has no inbox yet.
  teacher_invite: {
    role: "teacher",
    landing: "/dashboard/teacher",
    emailIsChosen: false,
  },
};

export function isClaimPurpose(value: string): value is ClaimPurpose {
  return Object.prototype.hasOwnProperty.call(CLAIMABLE, value);
}

/** Default 7 days. One knob for every purpose — nothing lives longer by accident. */
export function inviteTtlMs(): number {
  const hours =
    Number(process.env.INVITE_TOKEN_TTL_HOURS) ||
    Number(process.env.WALKIN_TOKEN_TTL_HOURS) ||
    168;
  return hours * 60 * 60 * 1000;
}

export function appBaseUrl(): string {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3002").replace(/\/$/, "");
}

export function claimLink(token: string, locale: "ar" | "en" = "ar"): string {
  return `${appBaseUrl()}/${locale}/claim?token=${token}`;
}

/**
 * Mask a claim token anywhere a link might be persisted or printed. The ONLY
 * durable copy of a token is the HASH in invite_tokens; every log row, audit
 * row and notification body goes through this first.
 */
export function redactToken(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9._~-]+/g, "$1***");
}

/**
 * Mint a fresh token, invalidating any outstanding unused one for the same
 * (user, purpose) — so exactly ONE live link exists per invite at any moment
 * and a re-send silently kills the previous link.
 *
 * Returns the OPAQUE token. It leaves the server exactly twice: inside the
 * invite email, and in the create/resend response so the creator can hand the
 * link over in person. It is never written anywhere in the clear.
 */
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
