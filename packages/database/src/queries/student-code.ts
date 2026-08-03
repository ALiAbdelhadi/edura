// ===========================================================================
// كود الطالب — THE STUDENT CODE.
//
// Eight characters, typed by a receptionist with a queue in front of them,
// printed on a card the student carries, and carried in that card's QR:
//
//        G 7K3M2Q F
//        │ │      └── check character
//        │ └───────── body (6) — unique, irreversible, issued once
//        └─────────── education-system letter (X while not yet known)
//
// ── WHAT IS DELIBERATELY NOT IN IT ─────────────────────────────────────────
//
// No date of birth, no phone digits, no initial of the name. The original
// request was for exactly those, and the two reasons they are absent are
// worth keeping written down, because both are failures that only show up
// after launch:
//
//   1. COLLISION. Inside eight characters, "stage letter + first letter of
//      the name + birth year + last two phone digits" is a space small
//      enough that two real children in one governorate share a code. This
//      code is what attendance and money run on. A collision is a lesson
//      marked for the wrong child and cash receipted against them.
//   2. DISCLOSURE. The code is printed, scanned, and read aloud across a
//      counter, and almost every student here is a MINOR. A code you can
//      read a child's birthday and phone digits out of is a code that leaks
//      them to everyone who is handed the card.
//
// So the body is derived FROM THE STUDENT — a digest of their own profile
// id, so their code is theirs and reproducible from their record — but it is
// one-way, and its input carries nothing personal even if it were reversed.
//
// ── WHY THERE IS A CHECK CHARACTER ─────────────────────────────────────────
//
// This is the property a real national ID has that a serial number does not.
// Today every `STU-000123` neighbours another valid code: one wrong digit at
// the counter resolves to a DIFFERENT CHILD, silently. With the check
// character, a single mistyped character — and any swap of two adjacent
// characters — cannot produce a valid code, so the counter says "not found"
// instead of finding the wrong student.
//
// The guarantee is exact, not decorative: the alphabet has 31 symbols and 31
// is prime, the weights are 1..7, so a single character changing by Δ shifts
// the sum by w·Δ, which is never ≡ 0 (mod 31) for 0 < |Δ| < 31; and swapping
// neighbours shifts it by ±(a−b), likewise never ≡ 0. Both classes are
// therefore ALWAYS caught, not usually caught.
//
// ── THE ALPHABET IS 31 SYMBOLS, NOT 32 ─────────────────────────────────────
//
// Crockford base32 drops I, L, O and U (I/L read as 1, O reads as 0, U for
// accidental words). We drop Z as well, and that is what buys the "always"
// above: with 31 symbols every value is < 31, so no character can differ
// from another by exactly the modulus.
//
// ── THIS FILE IS ISOMORPHIC ON PURPOSE ─────────────────────────────────────
//
// No imports at all — not even `node:` — so the card UI in the browser can
// format and the counter on the server can validate from ONE implementation.
// Issuance (which needs a digest and the database) lives next door in
// `student-code-issue.ts`. It sits in @repo/database rather than in
// server-core because the SQL function it must agree with lives here too.
//
// A SECOND IMPLEMENTATION EXISTS IN SQL — `gen_student_code()` mints the
// pending code inside the INSERT, so no creation path (register, walk-in,
// temp student, manual student, any seed) has to remember to call anything.
// Two implementations of one rule is a drift risk, so it is held closed by a
// proof rather than by a comment: `student-code-drift.test.ts` generates
// codes with the SQL function and verifies every one of them here.
// ===========================================================================

/**
 * Crockford base32 minus Z. 31 symbols — and 31 being PRIME is what the
 * check character's guarantee rests on. Do not add a symbol back.
 */
export const STUDENT_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXY";

export const STUDENT_CODE_MODULUS = STUDENT_CODE_ALPHABET.length; // 31
export const STUDENT_CODE_BODY_LENGTH = 6;
/** 1 letter + 6 body + 1 check. The whole point of the eight-character cap. */
export const STUDENT_CODE_LENGTH = 8;

/**
 * The system letter for a student whose education system is not known yet —
 * which is EVERY student between registering and finishing onboarding, since
 * the profile row exists before the wizard runs.
 *
 * A pending code is a real, valid, unique code: a walk-in student can be
 * checked in and pay cash on it the same minute. It is replaced exactly once,
 * when the system becomes known. See `finalizeStudentCode`.
 */
export const PENDING_SYSTEM_LETTER = "X";

/** Characters a human reliably confuses, mapped to what they meant. */
const CONFUSABLES: Record<string, string> = {
  I: "1",
  L: "1",
  O: "0",
};

function valueOf(char: string): number {
  return STUDENT_CODE_ALPHABET.indexOf(char);
}

/**
 * The weighted checksum over the first seven characters.
 *
 * Weights are 1..7 — distinct, all coprime to 31, and CONSECUTIVE, which is
 * what makes adjacent transpositions detectable (a swap moves the sum by the
 * weight difference, which is 1).
 */
export function studentCodeCheckChar(firstSeven: string): string {
  if (firstSeven.length !== STUDENT_CODE_LENGTH - 1) {
    throw new Error(`studentCodeCheckChar expects ${STUDENT_CODE_LENGTH - 1} characters`);
  }
  let sum = 0;
  for (let i = 0; i < firstSeven.length; i++) {
    const v = valueOf(firstSeven[i] as string);
    if (v < 0) throw new Error(`character out of alphabet: ${firstSeven[i]}`);
    sum += (i + 1) * v;
  }
  return STUDENT_CODE_ALPHABET[sum % STUDENT_CODE_MODULUS] as string;
}

/** Assemble a complete code from its parts, sealing it with the check char. */
export function buildStudentCode(systemLetter: string, body: string): string {
  const letter = systemLetter.toUpperCase();
  if (valueOf(letter) < 0) throw new Error(`system letter out of alphabet: ${systemLetter}`);
  if (body.length !== STUDENT_CODE_BODY_LENGTH) {
    throw new Error(`body must be ${STUDENT_CODE_BODY_LENGTH} characters`);
  }
  const head = letter + body.toUpperCase();
  return head + studentCodeCheckChar(head);
}

/**
 * What the counter's search box does to whatever was typed or scanned.
 *
 * Accepts the card's printed grouping ("G7K3-M2QF"), lowercase, stray spaces,
 * and the three confusions the alphabet was designed around. Returns `null`
 * — never a guess — when the result is not a code, so a caller cannot
 * accidentally treat free text as one.
 */
export function normalizeStudentCode(raw: string): string | null {
  if (!raw) return null;
  let out = "";
  for (const ch of raw.toUpperCase()) {
    if (ch === " " || ch === "-" || ch === "_" || ch === "‏" || ch === "‎") continue;
    const mapped = CONFUSABLES[ch] ?? ch;
    if (valueOf(mapped) < 0) return null;
    out += mapped;
  }
  return out.length === STUDENT_CODE_LENGTH ? out : null;
}

/**
 * The one function every lookup site calls: whatever was typed or scanned in,
 * the canonical stored code out — or `null`.
 *
 * `null` covers both "that is not a code" and "that is a code with a character
 * wrong in it", and the caller must treat them the same way: no match. This is
 * where the check character actually does its work — a mistyped code fails
 * HERE rather than resolving to a different child at the counter.
 */
export function resolveStudentCode(raw: string): string | null {
  const code = normalizeStudentCode(raw);
  if (!code) return null;
  return studentCodeCheckChar(code.slice(0, -1)) === code.slice(-1) ? code : null;
}

/** True only for a code whose check character agrees with its body. */
export function isValidStudentCode(raw: string): boolean {
  return resolveStudentCode(raw) !== null;
}

/** A code still carrying the placeholder letter — issued, but not final. */
export function isPendingStudentCode(code: string): boolean {
  return code.toUpperCase().startsWith(PENDING_SYSTEM_LETTER);
}

/**
 * `G7K3M2QF` → `G7K3-M2QF`. Grouping is for the eye and for reading a code
 * out over a phone; the stored value is never separated.
 */
export function formatStudentCode(code: string): string {
  const c = (normalizeStudentCode(code) ?? code.toUpperCase()).trim();
  if (c.length !== STUDENT_CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

/**
 * Six base-31 characters from a digest.
 *
 * Takes 8 bytes as a BigInt and reduces mod 31^6 — the tiny modulo bias is
 * irrelevant for an identifier whose uniqueness is guaranteed by a UNIQUE
 * index, not by the arithmetic.
 */
export function studentCodeBodyFromDigest(digest: Uint8Array): string {
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(digest[i] ?? 0);
  const m = BigInt(STUDENT_CODE_MODULUS);
  n %= m ** BigInt(STUDENT_CODE_BODY_LENGTH);

  let body = "";
  for (let i = 0; i < STUDENT_CODE_BODY_LENGTH; i++) {
    body = (STUDENT_CODE_ALPHABET[Number(n % m)] as string) + body;
    n /= m;
  }
  return body;
}
