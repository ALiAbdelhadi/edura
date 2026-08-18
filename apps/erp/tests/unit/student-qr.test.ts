// Proof for the student card's QR credential.
//
// The square on a student's ID card stopped being a picture of the code and
// became a signed URL (2026-08-09). Two claims now rest on this file, and both
// are the kind that fail silently:
//
//   1. AUTHENTICITY — a payload nobody signed must not scan. If this breaks,
//      nothing goes red: the counter simply accepts cards printed off a free
//      QR generator, and nobody finds out until a student is marked present at
//      a lesson they never attended.
//   2. NO PERSONAL DATA — the payload must carry the code, the version and a
//      signature, and NOTHING about the child. A card gets dropped in a school
//      corridor and photographed; almost every student here is a minor. This is
//      asserted against the payload's own SHAPE rather than by reading the
//      source, because a later "helpful" addition would read as harmless in a
//      diff and would be a disclosure in the field.
//
// The secret is read from the environment at call time, so the tests set it
// explicitly rather than relying on the development fallback — otherwise a
// change to that fallback would quietly change what is being proven.
import { beforeAll, describe, expect, it } from "vitest";

import {
  STUDENT_CODE_ALPHABET,
  buildStudentCode,
  formatStudentCode,
} from "@repo/database/student-code";

beforeAll(() => {
  process.env.STUDENT_QR_SECRET = "test-secret-for-student-qr";
  process.env.APP_BASE_URL = "https://edura.test";
});

// Imported lazily inside the tests would be cleaner, but the module reads the
// secret per call (not at import), so a top-level import is safe here.
const {
  buildStudentQrPayload,
  buildStudentQrUrl,
  parseStudentQr,
  readStudentScan,
} = await import("@repo/server-core/services/students/student-qr");

/** Real, check-character-valid codes. */
const CODE = buildStudentCode("G", "7K3M2Q");
const OTHER = buildStudentCode("A", "4PW1TN");

describe("the payload's shape", () => {
  it("is code-version-signature, and the code is readable in it", () => {
    const payload = buildStudentQrPayload(CODE, 1);
    const parts = payload.split("-");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe(CODE);
    expect(parts[1]).toBe("1");
    expect(parts[2]).toHaveLength(16);
  });

  it("CARRIES NOTHING ABOUT THE STUDENT BUT THEIR CODE", () => {
    // The one assertion this file exists for. Everything in the payload must be
    // accounted for by the three parts above — so a name, a grade, a birth date
    // or a token added later has nowhere to hide.
    const payload = buildStudentQrPayload(CODE, 7);
    const [code, version, signature] = payload.split("-") as [string, string, string];
    expect(`${code}-${version}-${signature}`).toBe(payload);

    // And the signature is drawn from a fixed alphabet, so it cannot smuggle
    // text: no lowercase, no punctuation, no separator.
    expect(signature).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("is short enough to stay a comfortable QR at card size", () => {
    // ~46 characters for a real origin. Beyond ~60 the square gains a version
    // and the modules shrink at the same printed 20mm, which is the difference
    // between scanning across a counter and having to hold the card up.
    expect(buildStudentQrUrl(CODE, 1).length).toBeLessThanOrEqual(60);
  });

  it("refuses to sign a code that is not one, or a version that is not one", () => {
    expect(() => buildStudentQrPayload("NOTACODE", 1)).toThrow();
    expect(() => buildStudentQrPayload(CODE, 0)).toThrow();
    expect(() => buildStudentQrPayload(CODE, -1)).toThrow();
    expect(() => buildStudentQrPayload(CODE, 1.5)).toThrow();
  });
});

describe("verification", () => {
  it("accepts a payload it signed itself", () => {
    const parsed = parseStudentQr(buildStudentQrPayload(CODE, 3));
    expect(parsed).toMatchObject({ code: CODE, version: 3, signatureValid: true });
  });

  it("reads the payload out of the full URL a phone camera hands over", () => {
    const parsed = parseStudentQr(buildStudentQrUrl(CODE, 2));
    expect(parsed).toMatchObject({ code: CODE, version: 2, signatureValid: true });
  });

  it("survives what a scanner actually delivers — whitespace, case, a query string", () => {
    const url = buildStudentQrUrl(CODE, 1);
    for (const raw of [` ${url} `, `${url}?utm=whatsapp`, `${url}#x`, url.toLowerCase()]) {
      expect(parseStudentQr(raw)).toMatchObject({ code: CODE, signatureValid: true });
    }
  });

  it("accepts the payload from ANY origin — the signature is the trust, not the host", () => {
    // A center reaching the app on a staging host, a custom domain or an IP
    // must not have its cards refused.
    const payload = buildStudentQrPayload(CODE, 1);
    for (const origin of ["https://staging.edura.test", "http://10.0.0.4:3002"]) {
      expect(parseStudentQr(`${origin}/c/${payload}`)).toMatchObject({
        signatureValid: true,
      });
    }
  });

  it("REJECTS every single-character change to the signature", () => {
    const payload = buildStudentQrPayload(CODE, 1);
    const sig = payload.split("-")[2] as string;
    let checked = 0;
    for (let i = 0; i < sig.length; i++) {
      for (const ch of "0123456789ABCDEFGHJKMNPQRSTVWXYZ") {
        if (ch === sig[i]) continue;
        const bad = `${CODE}-1-${sig.slice(0, i) + ch + sig.slice(i + 1)}`;
        expect(parseStudentQr(bad)?.signatureValid).toBe(false);
        checked++;
      }
    }
    expect(checked).toBe(sig.length * 31);
  });

  it("REJECTS a payload signed with a different secret", () => {
    const payload = buildStudentQrPayload(CODE, 1);
    const original = process.env.STUDENT_QR_SECRET;
    try {
      process.env.STUDENT_QR_SECRET = "somebody-elses-secret";
      expect(parseStudentQr(payload)?.signatureValid).toBe(false);
    } finally {
      process.env.STUDENT_QR_SECRET = original;
    }
  });

  it("REJECTS a signature lifted from another student, and from another version", () => {
    const mine = buildStudentQrPayload(CODE, 1).split("-")[2] as string;
    // The same signature under a different code…
    expect(parseStudentQr(`${OTHER}-1-${mine}`)?.signatureValid).toBe(false);
    // …and under a different version. This one is the revocation guarantee:
    // if a signature survived a version bump, reissuing a lost card would not
    // stop the lost card.
    expect(parseStudentQr(`${CODE}-2-${mine}`)?.signatureValid).toBe(false);
  });

  it("cannot be re-cut between the code and the version", () => {
    // `code|version` is signed with the separator INSIDE the signed string, so
    // no two different splits can hash to the same bytes.
    const a = buildStudentQrPayload(CODE, 12).split("-")[2];
    const b = buildStudentQrPayload(CODE, 1).split("-")[2];
    expect(a).not.toBe(b);
  });

  it("refuses a payload whose CODE is mistyped, before the signature is even relevant", () => {
    // student-code v2's check character does this: one wrong character must
    // fail rather than resolve to a different child.
    const good = buildStudentQrPayload(CODE, 1);
    const wrongCode = STUDENT_CODE_ALPHABET[(STUDENT_CODE_ALPHABET.indexOf(CODE[1] as string) + 1) % 31];
    const broken = CODE[0] + wrongCode + CODE.slice(2);
    expect(parseStudentQr(good.replace(CODE, broken))).toBeNull();
  });

  it("returns null for things that are not payloads at all", () => {
    for (const raw of ["", "hello", "https://edura.test/", CODE, `${CODE}-1-SHORT`]) {
      expect(parseStudentQr(raw)).toBeNull();
    }
  });
});

describe("readStudentScan — the one entry point every scanning surface calls", () => {
  it("names a signed card, a bare code, a forgery and noise as four different things", () => {
    const signed = readStudentScan(buildStudentQrUrl(CODE, 4));
    expect(signed).toEqual({ kind: "signed", code: CODE, version: 4 });

    // A code typed at the counter, or read off the front of the card. It
    // carries NO proof of issuance and must not be confused with one.
    expect(readStudentScan(CODE)).toEqual({ kind: "scanned_code", code: CODE });
    // The card's own printed grouping, which is what a person reads aloud.
    expect(readStudentScan(formatStudentCode(CODE))).toEqual({
      kind: "scanned_code",
      code: CODE,
    });

    expect(readStudentScan(`${CODE}-1-0000000000000000`)).toEqual({
      kind: "forged",
      code: CODE,
      version: 1,
    });

    expect(readStudentScan("just some text")).toEqual({ kind: "unreadable" });
  });
});

describe("the secret", () => {
  it("FAILS CLOSED in production rather than signing with a guessable value", async () => {
    const secret = process.env.STUDENT_QR_SECRET;
    const env = process.env.NODE_ENV;
    try {
      delete process.env.STUDENT_QR_SECRET;
      // NODE_ENV is readonly in the Node types but writable at runtime; this is
      // the only way to exercise the branch that matters most.
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(() => buildStudentQrPayload(CODE, 1)).toThrow(/STUDENT_QR_SECRET/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = env as string;
      process.env.STUDENT_QR_SECRET = secret as string;
    }
  });

  it("uses a FIXED development fallback, not the app secret", async () => {
    // www and apps/superadmin carry deliberately different auth secrets. If the
    // fallback were "the app secret", a card rendered in the back office would
    // fail verification at a www counter — in front of a customer.
    const secret = process.env.STUDENT_QR_SECRET;
    try {
      delete process.env.STUDENT_QR_SECRET;
      process.env.BETTER_AUTH_SECRET = "www-secret";
      const a = buildStudentQrPayload(CODE, 1);
      process.env.BETTER_AUTH_SECRET = "superadmin-secret";
      const b = buildStudentQrPayload(CODE, 1);
      expect(a).toBe(b);
    } finally {
      process.env.STUDENT_QR_SECRET = secret as string;
    }
  });
});
