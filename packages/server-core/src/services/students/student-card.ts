import { platformDb } from "../../db/scope";
import { ForbiddenError, NotFoundError } from "../../errors/classes";
import type { SessionUser } from "../../auth/types";
import { assertApprovedChild } from "../wallet/parent-wallet";
import { isPendingStudentCode } from "@repo/database/student-code";

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
// ── THE QR CARRIES THE CODE AND NOTHING ELSE ───────────────────────────────
//
// Not a token, not a URL, not a signed payload. That is a security decision,
// not a simplification: a photographed card must grant NO access. Scanning it
// only types the same eight characters a receptionist could read aloud, and
// every check-in path behind that still demands an authenticated staff actor
// with a live link to the center. It also means an ordinary barcode scanner —
// the kind that acts as a keyboard — works with no server change at all.
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
    } else {
      // Teachers, centers and staff have their own roster surfaces; a student's
      // card is the student's. Widening this is a decision, not a default.
      throw new ForbiddenError("Not allowed to view this student card");
    }

    const user = await tx.user.findFirst({
      where: { id: studentUserId, role: "student", deletedAt: null },
      select: { id: true, name: true, createdAt: true },
    });
    if (!user) throw new NotFoundError("Student not found");

    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentUserId },
      select: {
        studentCode: true,
        educationSystem: { select: { nameAr: true, nameEn: true } },
        stage: { select: { nameAr: true, nameEn: true } },
        gradeLevel: { select: { nameAr: true, nameEn: true } },
        track: { select: { nameAr: true, nameEn: true } },
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

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
    };
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
};

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
      },
    });
    if (!profile) throw new NotFoundError("Student profile not found");

    const items: ProfileChecklistItem[] = [
      {
        key: "name",
        done: user.name.trim().length > 0,
        blocking: false,
        fixHref: "/dashboard/student/settings",
      },
      {
        key: "phone",
        done: Boolean(user.phone ?? profile.phone),
        blocking: false,
        fixHref: "/dashboard/student/settings",
      },
      {
        // The one item that is actually costing them something right now:
        // without it a minor cannot message a teacher at all. Fixed inline by
        // the guardian notice rendered beside this list, so no link.
        key: "guardianEmail",
        done: Boolean(profile.guardianEmail),
        blocking: true,
        fixHref: null,
      },
      {
        key: "academic",
        done: profile.onboardingCompleted && Boolean(profile.gradeLevelId),
        blocking: true,
        fixHref: "/onboarding",
      },
    ];

    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
    };
  });
}
