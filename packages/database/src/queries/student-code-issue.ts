import { createHash } from "node:crypto";
import type { TenantTx } from "../client";
import {
  PENDING_SYSTEM_LETTER,
  buildStudentCode,
  isPendingStudentCode,
  studentCodeBodyFromDigest,
} from "./student-code";

// ===========================================================================
// ISSUING THE FINAL CODE — once, and never again.
//
// A student's profile row exists before they choose an education system, so
// the code they are born with carries the placeholder letter `X`. This module
// is where it becomes theirs for good.
//
// ── WHY "ONCE" IS ENFORCED AND NOT JUST INTENDED ───────────────────────────
//
// The code is printed on a card, read at a counter, quoted on receipts and
// scanned from a QR. A code that changes is a card that stops working and a
// receipt that names a code nobody can look up. So the update is written
// `WHERE student_code LIKE 'X%'`: once a real letter is on it, no call to
// this function — from onboarding, from a re-run, from a future caller who
// did not read this comment — can move it.
//
// That is also the whole reason the letter encodes the education SYSTEM and
// not the stage. A student moves from preparatory to secondary; they do not
// move from Azhari to General. A stage letter would have to be re-issued
// every couple of years, which would mean either a lying letter or a second
// table just to keep old cards resolvable.
//
// ── "DERIVED FROM THE STUDENT" IS LITERAL HERE ─────────────────────────────
//
// The body is a digest of the student's OWN profile id. Their code is
// therefore reproducible from their record, and no two students can be given
// each other's. The digest is one-way, and its input is a random UUID rather
// than anything about the child — so even reversed it says nothing.
//
// No secret key, and deliberately no new required env var: the input is
// already unguessable, so a pepper would add key management without adding
// secrecy.
// ===========================================================================

const DIGEST_PREFIX = "edura:student-code:v1:";

/** The body this profile id derives to on a given attempt. */
export function deriveStudentCodeBody(profileId: string, attempt = 0): string {
  const digest = createHash("sha256").update(`${DIGEST_PREFIX}${profileId}:${attempt}`).digest();
  return studentCodeBodyFromDigest(digest);
}

export type FinalizeResult = {
  studentCode: string;
  /** False when the code was already final — the ordinary case on a re-run. */
  changed: boolean;
};

/**
 * Give a student their permanent code, if they do not have one yet.
 *
 * Call it inside the same transaction as the write that first establishes the
 * education system (onboarding), so a student can never be left onboarded and
 * still pending. Safe to call again: it is a no-op on an already-final code.
 */
export async function finalizeStudentCode(
  tx: TenantTx,
  studentUserId: string,
): Promise<FinalizeResult | null> {
  const profile = await tx.studentProfile.findUnique({
    where: { userId: studentUserId },
    select: {
      id: true,
      studentCode: true,
      educationSystem: { select: { codeLetter: true } },
    },
  });
  if (!profile) return null;
  if (!isPendingStudentCode(profile.studentCode)) {
    return { studentCode: profile.studentCode, changed: false };
  }

  const letter = profile.educationSystem?.codeLetter;
  // No system yet (or a catalog row without a letter): the pending code stays
  // valid and usable. Nothing is broken by waiting.
  if (!letter || letter === PENDING_SYSTEM_LETTER) {
    return { studentCode: profile.studentCode, changed: false };
  }

  // The UNIQUE index is the real guarantee; these attempts just avoid asking
  // a human to resolve a one-in-a-billion coincidence.
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = buildStudentCode(letter, deriveStudentCodeBody(profile.id, attempt));
    const taken = await tx.studentProfile.findUnique({
      where: { studentCode: candidate },
      select: { id: true },
    });
    if (taken && taken.id !== profile.id) continue;

    // The guard, not a convenience: this is what makes issuance once-only.
    const written = await tx.studentProfile.updateMany({
      where: { id: profile.id, studentCode: { startsWith: PENDING_SYSTEM_LETTER } },
      data: { studentCode: candidate },
    });
    if (written.count === 0) {
      // Someone finalized it between the read and the write. Theirs wins.
      const now = await tx.studentProfile.findUnique({
        where: { id: profile.id },
        select: { studentCode: true },
      });
      return { studentCode: now?.studentCode ?? profile.studentCode, changed: false };
    }
    return { studentCode: candidate, changed: true };
  }

  throw new Error(`could not issue a student code for profile ${profile.id}`);
}
