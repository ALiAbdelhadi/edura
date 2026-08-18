import { platformDb } from "../../db/scope";
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { assertApprovedChild } from "../wallet/parent-wallet";
import { isPendingStudentCode } from "@repo/database/student-code";
import { buildStudentQrUrl } from "./student-qr";

// ===========================================================================
// بطاقة الطالب — THE STUDENT CARD, resolved once.
//
// Built on the same shape as `services/payments/receipt-document.ts`: the
// authorization runs FIRST and nothing is read until it passes, so there is
// exactly one answer to "may I see this card?".
//
// ── WHO MAY SEE IT ─────────────────────────────────────────────────────────
//
// The student, and a parent with an APPROVED link — nobody else, and no new
// authorization logic: the parent case calls `assertApprovedChild`, the same
// gate every parent money and browse path already goes through, so a pending,
// rejected or revoked link fails here for the same reason it fails there.
//
// ── WHAT THE CARD DELIBERATELY DOES NOT CARRY ──────────────────────────────
//
// No phone, no email, no date of birth, no national ID, no wallet balance, no
// parent's name. A card is the one object in this product that LEAVES it — it
// is printed, photographed, sent over WhatsApp, and dropped in school
// corridors. Almost every student here is a minor, so the card carries the
// least that still makes it useful: who they are, what they study, and the
// code the counter needs.
//
// ── THE QR CARRIES A SIGNED HANDLE, AND STILL NO PERSONAL DATA ─────────────
//
// (Amended 2026-08-09, Ali's decision. It previously carried the bare student
// code; the reasoning that replaced it is in `student-qr.ts`, and the part
// that did NOT change is the important one.)
//
// The square now encodes a signed URL — `…/c/G7K3M2QF-1-<signature>` — so the
// card can PROVE it was issued by us and can be REVOKED when it is lost.
// Neither is possible with a bare code, which any free QR generator can mint.
//
// What is still absent from the payload: the name, the grade, the birth date,
// the phone, the parent, the center, and any bearer token. The name is printed
// above the QR in the largest type on the card, so putting it in the square
// would inform nobody holding the card while turning one dropped in a corridor
// into a machine-readable record of a child. And presenting the payload
// authenticates the CARD, never a person — every path behind it still demands
// a signed-in staff actor with a live link to the center.
//
// The code sits inside the payload in plain sight so an ordinary keyboard-wedge
// barcode scanner keeps working with no server change, exactly as before.
// ===========================================================================

export type StudentCard = {
  studentId: string;
  name: string;
  studentCode: string;
  /**
   * True while the code still carries the placeholder letter — the student has
   * not finished onboarding. The UI shows the checklist instead of the card,
   * because a card whose code changes later is worse than no card.
   */
  isPending: boolean;
  /** Localised, both languages resolved server-side so the card can print. */
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  stage: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  /** "عضو منذ" — the account's own birthday, not the profile row's. */
  memberSince: Date;
  /**
   * The seed the guilloché is drawn from. The student's own id: stable for
   * life, so their card never changes pattern, and unique, so no two cards
   * look alike. Not a secret — it is already the id in every URL they open.
   */
  patternSeed: string;
  /**
   * Everything the QR square needs, resolved HERE so no surface computes it
   * twice. The print sheet and the PNG exporter both receive the whole card,
   * so they draw the same square without a second request.
   */
  qr: StudentCardQr;
};

export type StudentCardQr = {
  /** The absolute signed URL the square encodes. */
  url: string;
  version: number;
  issuedAt: Date | null;
  /** Set only while the card is revoked; shown verbatim to whoever holds it. */
  revokedAt: Date | null;
  revokedReason: string | null;
};

export async function buildStudentCard(
  studentUserId: string,
  caller: SessionUser,
): Promise<StudentCard> {
  return platformDb(async (tx) => {
    // ---- The gate, before anything is read.
    if (caller.role === "student") {
      if (caller.id !== studentUserId) {
        throw new ForbiddenError("Not your student card");
      }
    } else if (caller.role === "parent") {
      await assertApprovedChild(tx, caller.id, studentUserId);
    } else if (caller.role === "super_admin") {
      // Widened 2026-08-09 (Ali's decision) so the back office can look at,
      // reissue and revoke any student's card. It is a WIDENING, so it is
      // AUDITED: opening a child's identity document leaves a row, the same
      // posture `messaging.thread_viewed` already takes for reading a thread.
      // Written before the read, in the same transaction, so a look that
      // succeeds cannot fail to be recorded.
      await tx.auditLog.create({
        data: {
          actorId: caller.id,
          action: "student.card_viewed",
          targetType: "student",
          targetId: studentUserId,
        },
      });
    } else {
      // Teachers, centers and staff have their own roster surfaces; a student's
      // card is the student's. Widening this is a decision, not a default.
      throw new ForbiddenError("Not allowed to view this student card");
    }

    const user = await tx.user.findFirst({
      where: { id: studentUserId, role: "student", deletedAt: null },
      select: { id: true, name: true, phone: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("Student not found");

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: {
        studentCode: true,
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
        // Read for the completeness gate below. Scalars on a row this query
        // already fetches, so the gate costs nothing.
        phone: true,
        guardianEmail: true,
        onboardingCompleted: true,
        gradeLevelId: true,
        educationSystem: { select: { nameAr: true, nameEn: true } },
        stage: { select: { nameAr: true, nameEn: true } },
        gradeLevel: { select: { nameAr: true, nameEn: true } },
        track: { select: { nameAr: true, nameEn: true } },
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    // ---- A CARD IS ISSUED TO A COMPLETE RECORD, and that is enforced HERE
    // rather than in the screen (Ali's decision, 2026-08-09).
    //
    // A card is a document that leaves the product: it gets printed, sent over
    // WhatsApp and handed across a counter. Minting one from a half-filled
    // record produces an object that outlives the gaps in it — and the student
    // has no way to recall the copies once the record is corrected.
    //
    // WITHHOLDING THE CARD DOES NOT WITHHOLD THE STUDENT. Their code still
    // exists and still works; `lookupStudents` finds them by phone or by name,
    // so an incomplete student can still be checked in and can still pay at the
    // counter. This gate costs them a printed card, never a lesson.
    //
    // A SUPER ADMIN IS EXEMPT, deliberately: the back office's job includes
    // looking at exactly the records that are not in order, and its panel
    // already renders the pending/incomplete state rather than hiding it.
    if (caller.role !== "super_admin") {
      const complete = isProfileComplete({
        name: user.name,
        userPhone: user.phone,
        profilePhone: profile.phone,
        guardianEmail: profile.guardianEmail,
        onboardingCompleted: profile.onboardingCompleted,
        gradeLevelId: profile.gradeLevelId,
      });
      if (!complete) {
        throw new BusinessRuleError("PROFILE_INCOMPLETE");
      }
    }

    return {
      studentId: user.id,
      name: user.name,
      studentCode: profile.studentCode,
      isPending: isPendingStudentCode(profile.studentCode),
      educationSystem: profile.educationSystem,
      stage: profile.stage,
      gradeLevel: profile.gradeLevel,
      track: profile.track,
      memberSince: user.createdAt,
      patternSeed: user.id,
      qr: {
        // Signed here rather than in the UI: the secret is server-only, and a
        // payload minted anywhere else would be a second implementation of the
        // one rule the counter trusts.
        url: buildStudentQrUrl(profile.studentCode, profile.qrVersion),
        version: profile.qrVersion,
        issuedAt: profile.qrIssuedAt,
        revokedAt: profile.qrRevokedAt,
        revokedReason: profile.qrRevokedReason,
      },
    };
  });
}

// ---------------------------------------------------------------------------
// إعادة إصدار / إيقاف البطاقة — the two writes.
//
// Both are super-admin only and both demand a REASON, for the same reason
// every act on the user-detail screen does: the audit row is the only durable
// explanation anyone will ever have for why a child's card stopped working,
// and a card refused at a counter with no recorded reason is one nobody can
// safely un-refuse.
//
// Neither touches the student code. The code is issued once and is what
// attendance, cash and every receipt key on (student-code v2, decision #4);
// only the CREDENTIAL on top of it is reissued.
// ---------------------------------------------------------------------------

export type CardCredentialResult = {
  version: number;
  issuedAt: Date | null;
  revokedAt: Date | null;
  revokedReason: string | null;
};

/**
 * The column names are `qr*`-prefixed because they live on a table with 40
 * other columns; the API shape is not, because it is already inside a `qr`
 * object. One mapper so the two writes cannot answer differently.
 */
function asCredential(row: {
  qrVersion: number;
  qrIssuedAt: Date | null;
  qrRevokedAt: Date | null;
  qrRevokedReason: string | null;
}): CardCredentialResult {
  return {
    version: row.qrVersion,
    issuedAt: row.qrIssuedAt,
    revokedAt: row.qrRevokedAt,
    revokedReason: row.qrRevokedReason,
  };
}

function assertSuperAdmin(caller: SessionUser) {
  if (caller.role !== "super_admin") {
    throw new ForbiddenError("Only a super admin may act on a student card");
  }
}

function requireReason(reason: string): string {
  const trimmed = reason?.trim() ?? "";
  if (trimmed.length < 3) {
    throw new BusinessRuleError("A reason is required");
  }
  return trimmed;
}

/**
 * Mint a new credential: the version goes up, every card printed before this
 * moment stops verifying, and the student's card page shows the new square the
 * next time it is opened. Also LIFTS a revocation — reissuing is what makes a
 * revoked student whole again, so making them two separate steps would only
 * create a state where the operator thinks they are done and the child still
 * cannot check in.
 */
export async function reissueStudentCard(
  studentUserId: string,
  caller: SessionUser,
  reason: string,
): Promise<CardCredentialResult> {
  assertSuperAdmin(caller);
  const why = requireReason(reason);

  return platformDb(async (tx) => {
    const before = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { qrVersion: true, qrRevokedAt: true, qrRevokedReason: true },
    });
    if (!before) throw new NotFoundError("Student profile not found");

    const after = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: {
        qrVersion: { increment: 1 },
        qrIssuedAt: new Date(),
        qrRevokedAt: null,
        qrRevokedReason: null,
      },
      select: {
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: caller.id,
        action: "student.card_reissued",
        targetType: "student",
        targetId: studentUserId,
        beforeState: {
          version: before.qrVersion,
          revoked: before.qrRevokedAt !== null,
        },
        afterState: { version: after.qrVersion, reason: why },
      },
    });

    return asCredential(after);
  });
}

/**
 * Stop the card without issuing a replacement — "reported lost, and the
 * student is not here to be handed a new one".
 *
 * The version is NOT bumped: revoking is a state, and bumping here would mean
 * a later reissue skipped a number for no reason anyone could reconstruct.
 * The counter reads `qrRevokedAt`, so the refusal is the same either way.
 */
export async function revokeStudentCard(
  studentUserId: string,
  caller: SessionUser,
  reason: string,
): Promise<CardCredentialResult> {
  assertSuperAdmin(caller);
  const why = requireReason(reason);

  return platformDb(async (tx) => {
    const before = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: { qrVersion: true, qrRevokedAt: true },
    });
    if (!before) throw new NotFoundError("Student profile not found");
    if (before.qrRevokedAt) {
      throw new BusinessRuleError("This card is already revoked");
    }

    const after = await tx.studentProfile.update({
      where: { userId: studentUserId },
      data: { qrRevokedAt: new Date(), qrRevokedReason: why },
      select: {
        qrVersion: true,
        qrIssuedAt: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: caller.id,
        action: "student.card_revoked",
        targetType: "student",
        targetId: studentUserId,
        beforeState: { version: before.qrVersion, revoked: false },
        afterState: { version: after.qrVersion, revoked: true, reason: why },
      },
    });

    return asCredential(after);
  });
}

// ---------------------------------------------------------------------------
// اكتمال البيانات — the checklist that sits under the card.
//
// Derived entirely from columns that already exist; it stores nothing and
// decides nothing. Each item names the ONE screen that fixes it, so "your
// account is incomplete" is never a dead end.
//
// `guardianEmail` is not an ordinary field on this list. For a MINOR it is the
// condition that unlocks messaging with adults (chat-guardian.ts owns that
// rule — this only reports it), which is why it is marked `blocking`.
// ---------------------------------------------------------------------------

export type ProfileChecklistItem = {
  key: "name" | "phone" | "guardianEmail" | "academic";
  done: boolean;
  /** A missing one of these costs the student something concrete today. */
  blocking: boolean;
  /**
   * The ONE screen that fixes it — or null when the fix is inline on the card
   * page itself (the guardian email, handled by the existing notice).
   *
   * NOTE ON WHAT IS NOT LISTED: `date_of_birth` is missing for almost every
   * student and looks like an obvious checklist row, but there is no
   * student-facing way to set it — it is written by a super admin, against
   * evidence, because it decides whether a child counts as an adult in the
   * messaging rules. Listing it would be an item the student can never tick,
   * which the design constitution names outright: never imply an action that
   * will be refused.
   */
  fixHref: string | null;
};

export type ProfileChecklist = {
  items: ProfileChecklistItem[];
  completed: number;
  total: number;
  /**
   * Whether the card can be built at all — the ONE flag the screen reads to
   * decide between "here is the button" and "here is what is still missing".
   *
   * It exists so the screen never has to re-derive completeness from `items`
   * client-side. The gate is enforced in `buildStudentCard` (below); this is
   * the same answer, sent ahead of time, so the UI can avoid asking for a card
   * it already knows will be refused.
   */
  cardAvailable: boolean;
};

// ---------------------------------------------------------------------------
// ONE DEFINITION OF "COMPLETE".
//
// The checklist reports it and `buildStudentCard` enforces it. Written once,
// here, because two copies would eventually disagree — and the shape of that
// disagreement is the worst one available: a screen that shows a student a
// "print my card" button and a server that then refuses it.
// ---------------------------------------------------------------------------

type CompletenessRow = {
  name: string;
  userPhone: string | null;
  profilePhone: string | null;
  guardianEmail: string | null;
  onboardingCompleted: boolean;
  gradeLevelId: string | null;
};

function checklistItems(row: CompletenessRow): ProfileChecklistItem[] {
  return [
    {
      key: "name",
      done: row.name.trim().length > 0,
      blocking: false,
      fixHref: "/dashboard/student/settings",
    },
    {
      key: "phone",
      done: Boolean(row.userPhone ?? row.profilePhone),
      blocking: false,
      fixHref: "/dashboard/student/settings",
    },
    {
      // The one item that is actually costing them something right now:
      // without it a minor cannot message a teacher at all. Fixed inline by
      // the guardian notice rendered beside this list, so no link.
      key: "guardianEmail",
      done: Boolean(row.guardianEmail),
      blocking: true,
      fixHref: null,
    },
    {
      key: "academic",
      done: row.onboardingCompleted && Boolean(row.gradeLevelId),
      blocking: true,
      fixHref: "/onboarding",
    },
  ];
}

function isProfileComplete(row: CompletenessRow): boolean {
  return checklistItems(row).every((i) => i.done);
}

export async function buildProfileChecklist(
  studentUserId: string,
  caller: SessionUser,
): Promise<ProfileChecklist> {
  return platformDb(async (tx) => {
    if (caller.role === "student") {
      if (caller.id !== studentUserId) throw new ForbiddenError("Not your profile");
    } else if (caller.role === "parent") {
      await assertApprovedChild(tx, caller.id, studentUserId);
    } else {
      throw new ForbiddenError("Not allowed");
    }

    const user = await tx.user.findFirst({
      where: { id: studentUserId, role: "student", deletedAt: null },
      select: { name: true, phone: true },
    });
    if (!user) throw new NotFoundError("Student not found");

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: {
        phone: true,
        guardianEmail: true,
        onboardingCompleted: true,
        gradeLevelId: true,
        // One extra column on a query that already runs — this is what lets the
        // screen decide whether to offer the card WITHOUT building one.
        studentCode: true,
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    const row: CompletenessRow = {
      name: user.name,
      userPhone: user.phone,
      profilePhone: profile.phone,
      guardianEmail: profile.guardianEmail,
      onboardingCompleted: profile.onboardingCompleted,
      gradeLevelId: profile.gradeLevelId,
    };
    const items = checklistItems(row);

    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
      // A pending code is checked separately from the items: a student can tick
      // every box while their code is still `X…` if onboarding committed but
      // finalisation did not, and handing out a card whose code is about to
      // change is the exact failure the pending state exists to prevent.
      cardAvailable:
        items.every((i) => i.done) && !isPendingStudentCode(profile.studentCode),
    };
  });
}
