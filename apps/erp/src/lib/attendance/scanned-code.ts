import { resolveStudentCode } from "@repo/database/student-code";

/* كود الطالب من مسحة / Pulling the student code out of whatever was scanned.
   ══════════════════════════════════════════════════════════════════════════════

   THE BROWSER-SIDE HALF of `parseStudentQr`. It parses the payload's SHAPE and
   deliberately does NOT verify the signature — verification needs
   `STUDENT_QR_SECRET`, and shipping that to a browser would hand every visitor
   the ability to mint cards. So this answers only "which student code is
   written in here", never "is this card genuine".

   THAT IS ENOUGH FOR THE SCREENS THAT CALL IT, and the reason is worth stating
   rather than assuming. Every one of them resolves the answer against a list
   the operator is ALREADY authorized to act on — this lesson's door roster,
   this course's enrolled students — and commits through the same endpoint the
   buttons beside each name post to. A forged square therefore buys nothing a
   tap on the row does not already buy. The card's authenticity is checked
   where it can be: on the server, by `readStudentScan`.

   ONE DEFINITION, because there were nearly two. The door screen grew an
   inline `raw.toUpperCase().includes(code)` fallback and the teacher's
   attendance screen was about to grow its own — and two answers to "which
   student is this?" is precisely how a scan lands on the wrong child. */

/**
 * `null` when nothing in `raw` resolves to a valid student code — including a
 * code whose CHECK CHARACTER disagrees, which is the whole point of
 * student-code v2: one mistyped or misread character must fail rather than
 * resolve to a different child.
 */
export function codeFromScan(raw: string): string | null {
  const text = raw?.trim();
  if (!text) return null;

  // A bare code (typed, or from a wedge scanner aimed at the printed line).
  const direct = resolveStudentCode(text);
  if (direct) return direct;

  // A URL — the shape a phone camera and a wedge scanner both hand over.
  // The origin is ignored on purpose (a center on a staging host or an IP must
  // still scan), and so is the signature: see the header.
  const withoutQuery = (text.split(/[?#]/)[0] ?? "").trim();
  const last = withoutQuery.split("/").filter(Boolean).pop();
  if (!last) return null;

  // `CODE-VERSION-SIGNATURE`. Taking the first segment rather than a substring
  // search keeps a code that happens to appear inside a signature from winning.
  const head = last.split("-")[0];
  return head ? resolveStudentCode(head) : null;
}
