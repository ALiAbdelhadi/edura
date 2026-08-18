import { createHmac, timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "../../http/app-url";
import { STUDENT_CODE_LENGTH, resolveStudentCode } from "@repo/database/student-code";

// ===========================================================================
// كود الـ QR — THE CARD'S SIGNED CREDENTIAL.
//
// Until now the QR held the student code and nothing else, which made it a
// PICTURE OF SOMETHING ALREADY PRINTED: the same eight characters sit beside
// it in 36px type, and any free QR generator produces a byte-identical square
// from them. A forged card and a real one were indistinguishable to a scanner,
// and a lost card could not be stopped, because there was nothing to stop.
//
// So the payload is now a signed URL:
//
//     https://edura.eg/c/G7K3M2QF-1-K4M9P2QX7RTV3NAB
//                        │        │  └── signature (80 bits, base32)
//                        │        └───── credential version
//                        └────────────── the student code, unchanged
//
// ── THE CODE IS STILL IN THERE, IN PLAIN SIGHT, ON PURPOSE ─────────────────
//
// A keyboard-wedge barcode scanner — the cheap kind that types what it reads
// into whatever field has focus — is what most centers will actually own. It
// will type this whole URL into the counter's search box, so `lookupStudents`
// pulls the code back out of it and behaves exactly as it did before. Adding
// trust must not cost the hardware path that already works.
//
// ── WHAT THE SIGNATURE BUYS, PRECISELY ─────────────────────────────────────
//
//   1. AUTHENTICITY. Only a holder of STUDENT_QR_SECRET can mint a scannable
//      card. Typing a code you overheard into a QR generator now produces a
//      square the counter refuses.
//   2. REVOCATION. The signature covers the VERSION, so bumping the version
//      kills every card printed before it — everywhere, instantly, with no
//      list of issued cards to walk.
//
// ── AND WHAT IT DELIBERATELY DOES NOT CARRY ────────────────────────────────
//
// No name, no grade, no date of birth, no phone, no parent, no center, no
// session id, no bearer token. Putting the name in would add NOTHING for
// anyone holding the card — it is printed above the QR in the largest type on
// the object — while turning a card dropped in a school corridor into a
// machine-readable record of a child for every free QR app on every phone.
// What a scanner gets instead is an opaque handle; the data is resolved
// server-side, tiered by who is asking (see the /c/[payload] page).
//
// The payload is NOT a credential that grants anything either: presenting it
// authenticates the CARD, never a person. Every path behind it still demands
// a signed-in staff actor with a live link to the center.
// ===========================================================================

/**
 * Crockford base32 — 32 symbols, no I/L/O/U. Chosen over hex because it is
 * ~25% shorter for the same entropy (fewer QR modules, a card that scans from
 * further away) and over base64url because `-`/`_` collide with the separator
 * and lowercase would knock the QR out of alphanumeric encoding mode.
 *
 * Unlike the student code's alphabet this one keeps Z: the 31-being-prime
 * guarantee is about typo detection on characters a HUMAN types, and nobody
 * types a signature.
 */
const SIG_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 16 symbols × 5 bits = 80 bits. Forging one costs 2^80 signing oracles. */
const SIG_LENGTH = 16;

/** The URL path the card points at. One character, because it is printed. */
export const STUDENT_QR_PATH = "c";

/** The current payload grammar. Bumping it is how a future format coexists. */
const PAYLOAD_PATTERN = new RegExp(
  `^([0-9A-Z]{${STUDENT_CODE_LENGTH}})-(\\d{1,4})-([${SIG_ALPHABET}]{${SIG_LENGTH}})$`,
);

/**
 * The signing secret.
 *
 * Required in production and fails closed — the M2 precedent, for the same
 * reason: a card silently signed with a guessable value is worse than a card
 * that cannot be issued at all, because nobody finds out until someone forges
 * one.
 *
 * The development fallback is a FIXED LITERAL rather than the app secret,
 * which is the one non-obvious part. www and apps/superadmin carry deliberately
 * DIFFERENT auth secrets (that separation is what makes a back-office session
 * unreadable by www), so falling back to "the app secret" would have a card
 * rendered in the back office fail verification at a www counter — a bug that
 * only appears when a super admin prints a card, i.e. in front of a customer.
 */
function qrSecret(): string {
  const value = process.env.STUDENT_QR_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "STUDENT_QR_SECRET is required in production (student ID cards are signed with it)",
    );
  }
  return "edura-development-student-qr-secret";
}

/** base32 over the first `SIG_LENGTH * 5` bits of the digest. */
function encodeSignature(digest: Buffer): string {
  let out = "";
  let bits = 0;
  let acc = 0;
  for (const byte of digest) {
    acc = (acc << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += SIG_ALPHABET[(acc >> bits) & 31];
      if (out.length === SIG_LENGTH) return out;
    }
  }
  return out;
}

/**
 * The signed part. The separator is inside the signed string, so a code and a
 * version cannot be re-cut against each other ("G7K3M2QF1" + "2" signing the
 * same bytes as "G7K3M2QF" + "12").
 */
function signatureFor(code: string, version: number): string {
  const mac = createHmac("sha256", qrSecret());
  mac.update(`edura.student-card.v1|${code}|${version}`);
  return encodeSignature(mac.digest());
}

/** `G7K3M2QF-1-K4M9P2QX7RTV3NAB` — the payload, without the origin. */
export function buildStudentQrPayload(code: string, version: number): string {
  // `resolveStudentCode`, NOT `normalizeStudentCode`: the check character has
  // to agree here as well as in `parseStudentQr`. Normalising only would let
  // the signer mint a perfectly valid signature over a code the verifier then
  // refuses — a card that prints, scans, and is rejected at the counter, with
  // the signature looking correct in every log. Caught by the proof, which is
  // why the two functions now use the same one.
  const normalized = resolveStudentCode(code);
  if (!normalized) throw new Error(`not a student code: ${code}`);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`qr version must be a positive integer, got ${version}`);
  }
  return `${normalized}-${version}-${signatureFor(normalized, version)}`;
}

/** The absolute URL the QR square actually encodes. */
export function buildStudentQrUrl(code: string, version: number): string {
  return `${appBaseUrl()}/${STUDENT_QR_PATH}/${buildStudentQrPayload(code, version)}`;
}

export type ParsedStudentQr = {
  code: string;
  version: number;
  /** False when the signature does not match — the card was not issued by us. */
  signatureValid: boolean;
};

/**
 * Pull a payload out of whatever arrived: the bare payload, the full URL a
 * phone camera hands over, or the URL a keyboard-wedge scanner typed into a
 * search box with a stray space on the end.
 *
 * Returns `null` for anything that is not shaped like a payload — including a
 * plain student code, which is NOT this function's job. Callers that accept
 * both fall through to `resolveStudentCode`, so the two stay one decision each.
 */
export function parseStudentQr(raw: string): ParsedStudentQr | null {
  if (!raw) return null;
  let text = raw.trim();

  // A URL: take the last non-empty path segment and ignore the origin. The
  // origin is deliberately NOT validated — a center that reaches the app on a
  // staging host, a custom domain, or an IP would otherwise have its cards
  // silently refused, and the signature is what establishes trust here, not
  // the hostname the square happens to name.
  if (text.includes("/")) {
    const withoutQuery = text.split(/[?#]/)[0] as string;
    const segments = withoutQuery.split("/").filter(Boolean);
    text = segments[segments.length - 1] ?? "";
  }

  const match = PAYLOAD_PATTERN.exec(text.toUpperCase());
  if (!match) return null;

  const [, rawCode, rawVersion, signature] = match as unknown as [
    string,
    string,
    string,
    string,
  ];

  // The check character has to agree before we go anywhere near the code: a
  // payload whose code is mistyped must fail HERE rather than resolving to a
  // different child, which is the entire point of student-code v2.
  const code = resolveStudentCode(rawCode);
  if (!code) return null;

  const version = Number(rawVersion);
  if (!Number.isInteger(version) || version < 1) return null;

  const expected = Buffer.from(signatureFor(code, version));
  const actual = Buffer.from(signature);
  const signatureValid =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  return { code, version, signatureValid };
}

/**
 * What a scan resolves to BEFORE the database is consulted.
 *
 * `scanned_code` is the honest name for a bare code: it reached us with no
 * proof of issuance at all — someone typed it, or read it off the front of the
 * card — and the counter is told so, because "the card is genuine" and "these
 * eight characters exist" are different claims and only one of them can be
 * made about a hand-typed code.
 */
export type StudentScan =
  | { kind: "signed"; code: string; version: number }
  | { kind: "scanned_code"; code: string }
  | { kind: "forged"; code: string; version: number }
  | { kind: "unreadable" };

/** The single entry point every scanning surface calls. */
export function readStudentScan(raw: string): StudentScan {
  const parsed = parseStudentQr(raw);
  if (parsed) {
    return parsed.signatureValid
      ? { kind: "signed", code: parsed.code, version: parsed.version }
      : { kind: "forged", code: parsed.code, version: parsed.version };
  }
  const code = resolveStudentCode(raw);
  return code ? { kind: "scanned_code", code } : { kind: "unreadable" };
}
