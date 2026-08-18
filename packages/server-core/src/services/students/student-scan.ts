import { platformDb, type TenantTx } from "../../db/scope";
import type { SessionUser } from "../../auth/types";
import { maskName } from "./disclosure";
import { readStudentScan } from "./student-qr";

// ===========================================================================
// مسح البطاقة — WHAT A SCAN RESOLVES TO, AND FOR WHOM.
//
// One function, because the QR is a URL and a URL is opened by whoever is
// pointing a camera at it. That is the whole reason this file exists: the
// square on the card cannot know who will scan it, so the ANSWER has to be
// tiered rather than the access.
//
//   TIER 1 — center staff whose center holds this student, OR the teacher who
//            actually teaches them (an assistant reaches it through the ONE
//            teacher they are linked to).
//            Everything: real name, code, grade, and a hand-off into the screen
//            that role owns — the counter for staff, the hall door for a
//            teacher. This is the point of the square.
//
//   TIER 2 — any other signed-in user
//            The SAME tiering `lookupStudents` already applies to a student
//            reached by identifier but not held by this center: masked name,
//            no phone. Not new policy — the same two functions, called here.
//
//   TIER 3 — nobody is signed in (a phone camera, anyone)
//            A VERIFICATION, not a record. Whether the card is genuine, the
//            code that is already printed on it in 36px type, and the
//            education system. No phone, no email, no birth date, no national
//            id, no parent, no center, no schedule, no money, no grade.
//
// ── WHY TIER 3 IS NOT THE FULL RECORD, WHEN THE ASK WAS "A PAGE WITH THE
//    STUDENT'S INFORMATION" ────────────────────────────────────────────────
//
// It IS that page — for the person it was meant for. A receptionist gets the
// whole record one login away, from the same square, with no scanner app and
// no special hardware. What tier 3 refuses is the OTHER reader: this card gets
// dropped in a school corridor and photographed across a microbus, and almost
// every student on this platform is a minor. "Point a camera at this child and
// learn their grade, their center and their timetable" is a locator, and it is
// the one thing a printed card cannot already be made to do.
//
// What tier 3 DOES give the person who found a card is exactly what they need:
// this is genuine (or it is revoked), here is the code, hand it in.
//
// ── AND WHY TIER 3 CANNOT BE USED TO PROBE ─────────────────────────────────
//
// Minting a scannable payload needs the server secret, so there is nothing to
// enumerate by brute force. The one probe that IS constructible — by someone
// who has a signed card and wonders whether another code exists — is answered
// identically to a forgery: a correctly-signed payload naming a code nobody
// holds returns `invalid`, exactly as a bad signature does. NO failure carries
// an identity.
//
// (`unreadable` is a separate outcome from `invalid`, and that is not a leak:
// it distinguishes "this string is not payload-shaped" from "this card is not
// ours", which is a fact about what the reader typed, not about any student.)
// ===========================================================================

/** Everything a scan can come back as. `viewer` decides how much rides along. */
export type StudentScanResult =
  | { outcome: "unreadable" }
  /** Not a card we issued — bad signature, unknown code, or no signature. */
  | { outcome: "invalid" }
  | {
      outcome: "revoked";
      revokedAt: Date;
      /** Shown verbatim: the holder is owed the reason their card was stopped. */
      reason: string;
      identity: ScanIdentity;
    }
  | {
      outcome: "superseded";
      /** The issue that IS current, so staff can say "you have an old card". */
      currentVersion: number;
      scannedVersion: number;
      identity: ScanIdentity;
    }
  | {
      outcome: "valid";
      identity: ScanIdentity;
      /** Present only for tier `counter` — the staff who can act on this student. */
      counter: { studentId: string; onOurRoster: boolean } | null;
      /**
       * Present only for tier `teacher` — the hall door, which is the ONLY
       * attendance surface a teacher or their assistant owns. `counter` and
       * `door` are mutually exclusive because the tier they come from is: one
       * viewer, one screen, so no surface has to choose between two hand-offs.
       */
      door: { studentId: string } | null;
    };

/**
 * The identity block, already reduced to what the tier permits. The caller
 * renders it as-is: no surface decides for itself what to hide, because that
 * is how one of them ends up deciding differently.
 */
export type ScanIdentity = {
  /** Tier 1 only — every other tier gets `null` and must not need it. */
  studentId: string | null;
  /** Full at tier 1, `أحمد م.` at tiers 2 and 3. */
  name: string | null;
  studentCode: string;
  /** Never narrower than the system at tier 3. */
  educationSystem: { nameAr: string; nameEn: string | null } | null;
  gradeLevel: { nameAr: string; nameEn: string | null } | null;
  track: { nameAr: string; nameEn: string | null } | null;
  /**
   * How much of the above is real, so the UI does not have to infer it.
   *
   * `counter` and `teacher` disclose the SAME fields and differ only in which
   * hand-off rides along — they are two names for tier 1, kept apart because
   * the hand-off is what the reader actually does next.
   */
  tier: "counter" | "teacher" | "signed_in" | "public";
};

/**
 * Roles that can hold a student on a roster and therefore reach tier 1.
 * `center_staff` is included because the receptionist IS the counter; the
 * sub-role gate lives on the route (`RECEPTION`), not here.
 */
const COUNTER_ROLES = new Set(["center_admin", "center_staff"]);

/**
 * Roles that reach tier 1 through TEACHING the student rather than holding
 * them on a roster. An assistant is here because Step 8 delegation is total
 * for attendance — they are the one standing at the hall door in
 * `counter_and_door` mode — and they resolve through their ONE live teacher
 * link, so a soft-removed assistant drops to tier 2 on the very next scan.
 */
const TEACHER_ROLES = new Set(["teacher", "assistant"]);

export async function resolveStudentScan(
  raw: string,
  viewer: SessionUser | null,
): Promise<StudentScanResult> {
  const scan = readStudentScan(raw);
  if (scan.kind === "unreadable") return { outcome: "unreadable" };

  // A bare code carries no proof of issuance, so it is not something a public
  // page may answer at all. Signed-in surfaces reach a bare code through
  // `lookupStudents`, which is where that path has always lived.
  if (scan.kind === "scanned_code" && !viewer) return { outcome: "invalid" };
  if (scan.kind === "forged") return { outcome: "invalid" };

  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { studentCode: scan.code },
      select: {
        userId: true,
        fullName: true,
        qrVersion: true,
        qrRevokedAt: true,
        qrRevokedReason: true,
        user: { select: { id: true, name: true, status: true, deletedAt: true } },
        educationSystem: { select: { nameAr: true, nameEn: true } },
        gradeLevel: { select: { nameAr: true, nameEn: true } },
        track: { select: { nameAr: true, nameEn: true } },
      },
    });

    // Same answer as a bad signature, deliberately — see the header.
    if (!profile || !profile.userId || profile.user?.deletedAt) {
      return { outcome: "invalid" };
    }

    const studentId = profile.userId;

    // ---- Tier. Decided once, from the viewer, before anything is shaped.
    let tier: ScanIdentity["tier"] = "public";
    let onOurRoster = false;
    if (viewer) {
      tier = "signed_in";
      if (COUNTER_ROLES.has(viewer.role) && viewer.centerId) {
        const roster = await tx.centerStudentRoster.findFirst({
          where: { centerId: viewer.centerId, studentId, leftAt: null },
          select: { id: true },
        });
        onOurRoster = roster !== null;
        // A center reading its OWN student is reading data it already holds.
        if (onOurRoster) tier = "counter";
      } else if (TEACHER_ROLES.has(viewer.role)) {
        // The relation is `enrollments -> courses.teacher_id` — the SAME one
        // attendance, grades and money already run on. A second definition of
        // "my student" living here could disagree with the one that decides
        // whether this teacher may mark them present.
        const teacherId = await actingTeacherId(tx, viewer);
        if (teacherId) {
          const taught = await tx.enrollment.findFirst({
            where: { studentId, status: "active", course: { teacherId } },
            select: { id: true },
          });
          // Nothing is disclosed that this teacher does not already read off
          // their own roster and attendance screens — an UNENROLLED student
          // is excluded for exactly that reason.
          if (taught) tier = "teacher";
        }
      }
      // A super admin already reaches the whole card through
      // `buildStudentCard`, which audits the read. Granting the same breadth
      // here — on an UNAUDITED path — would be a second, quieter door to the
      // same data, so they stay at `signed_in`.
    }

    // Tier 1, under either of its two names. Written once so a future third
    // way in cannot disclose a different set by forgetting one comparison.
    const full = tier === "counter" || tier === "teacher";

    const fullName = profile.user?.name ?? profile.fullName;
    const identity: ScanIdentity = {
      studentId: full ? studentId : null,
      name: full ? fullName : maskName(fullName),
      // Printed on the front of the card in the largest figure on it, so
      // echoing it back discloses nothing to whoever is holding the card —
      // and it is what lets a finder say which card they have.
      studentCode: scan.code,
      educationSystem: profile.educationSystem,
      // The grade and the track NARROW a child to a small group inside one
      // school. Tier 1 needs them to pick a session; nobody else does.
      gradeLevel: full ? profile.gradeLevel : null,
      track: full ? profile.track : null,
      tier,
    };

    if (profile.qrRevokedAt) {
      return {
        outcome: "revoked" as const,
        revokedAt: profile.qrRevokedAt,
        reason: profile.qrRevokedReason ?? "",
        identity,
      };
    }

    // Only a signed payload carries a version to compare. A bare code typed at
    // a counter is not an old CARD, it is a code — there is nothing to
    // supersede.
    if (scan.kind === "signed" && scan.version !== profile.qrVersion) {
      return {
        outcome: "superseded" as const,
        currentVersion: profile.qrVersion,
        scannedVersion: scan.version,
        identity,
      };
    }

    return {
      outcome: "valid" as const,
      identity,
      counter: tier === "counter" ? { studentId, onOurRoster } : null,
      door: tier === "teacher" ? { studentId } : null,
    };
  });
}

/**
 * The teacher this viewer acts for, or `null`.
 *
 * Deliberately NOT `resolveActingTeacher`: that one THROWS `ForbiddenError`
 * for an assistant with no live link, which is correct on an authorized route
 * and wrong here — this page is opened by whoever points a camera at a card,
 * so an unlinked assistant must quietly fall to tier 2, not 500 a public URL.
 * The rule it encodes (one live link, `removedAt IS NULL`) is identical.
 */
async function actingTeacherId(
  tx: TenantTx,
  viewer: SessionUser,
): Promise<string | null> {
  if (viewer.role === "teacher") return viewer.id;
  const link = await tx.teacherAssistant.findFirst({
    where: { assistantId: viewer.id, removedAt: null },
    select: { teacherId: true },
  });
  return link?.teacherId ?? null;
}
