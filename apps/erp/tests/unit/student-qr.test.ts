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

const {
  buildStudentQrPayload,
  buildStudentQrUrl,
  parseStudentQr,
  readStudentScan,
} = await import("@repo/server-core/services/students/student-qr");

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
    const payload = buildStudentQrPayload(CODE, 7);
    const [code, version, signature] = payload.split("-") as [string, string, string];
    expect(`${code}-${version}-${signature}`).toBe(payload);

    expect(signature).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  });

  it("is short enough to stay a comfortable QR at card size", () => {
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
    expect(parseStudentQr(`${OTHER}-1-${mine}`)?.signatureValid).toBe(false);
    expect(parseStudentQr(`${CODE}-2-${mine}`)?.signatureValid).toBe(false);
  });

  it("cannot be re-cut between the code and the version", () => {
    const a = buildStudentQrPayload(CODE, 12).split("-")[2];
    const b = buildStudentQrPayload(CODE, 1).split("-")[2];
    expect(a).not.toBe(b);
  });

  it("refuses a payload whose CODE is mistyped, before the signature is even relevant", () => {
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

    expect(readStudentScan(CODE)).toEqual({ kind: "scanned_code", code: CODE });
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
      (process.env as Record<string, string>).NODE_ENV = "production";
      expect(() => buildStudentQrPayload(CODE, 1)).toThrow(/STUDENT_QR_SECRET/);
    } finally {
      (process.env as Record<string, string>).NODE_ENV = env as string;
      process.env.STUDENT_QR_SECRET = secret as string;
    }
  });

  it("uses a FIXED development fallback, not the app secret", async () => {
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
