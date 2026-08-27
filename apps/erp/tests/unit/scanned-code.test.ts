import { beforeAll, describe, expect, it } from "vitest";

import { buildStudentCode } from "@repo/database/student-code";
import { codeFromScan } from "@/lib/attendance/scanned-code";

beforeAll(() => {
  process.env.STUDENT_QR_SECRET = "test-secret-for-scanned-code";
  process.env.APP_BASE_URL = "https://edura.test";
});

const { buildStudentQrUrl, buildStudentQrPayload, parseStudentQr } =
  await import("@repo/server-core/services/students/student-qr");

const CODE = buildStudentCode("G", "7K3M2Q");
const OTHER = buildStudentCode("A", "4PW1TN");

describe("what a scanner actually hands over", () => {
  it("reads the code out of the card's signed URL", () => {
    expect(codeFromScan(buildStudentQrUrl(CODE, 1))).toBe(CODE);
  });

  it("reads a bare payload, without an origin", () => {
    expect(codeFromScan(buildStudentQrPayload(CODE, 3))).toBe(CODE);
  });

  it("reads the eight characters typed by hand", () => {
    expect(codeFromScan(CODE)).toBe(CODE);
  });

  it("survives what a wedge scanner adds — whitespace, query, fragment", () => {
    const url = buildStudentQrUrl(CODE, 1);
    expect(codeFromScan(`  ${url}  `)).toBe(CODE);
    expect(codeFromScan(`${url}?utm_source=camera`)).toBe(CODE);
    expect(codeFromScan(`${url}#top`)).toBe(CODE);
    expect(codeFromScan(`${url}/`)).toBe(CODE);
  });

  it("applies the Crockford substitutions a human typing makes", () => {
    const typo = CODE.replace(/0/g, "O").replace(/1/g, "I").toLowerCase();
    expect(codeFromScan(typo)).toBe(CODE);
  });

  it("keeps the ORIGIN out of the answer — staging, an IP, a custom domain", () => {
    const payload = buildStudentQrPayload(CODE, 1);
    for (const origin of [
      "https://app.edura.eg",
      "http://192.168.1.40:3002",
      "https://edura-www.vercel.app",
    ]) {
      expect(codeFromScan(`${origin}/c/${payload}`)).toBe(CODE);
    }
  });
});

describe("what it must refuse", () => {
  it("refuses a code whose check character disagrees", () => {
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXY";
    let checked = 0;
    for (let i = 0; i < CODE.length; i++) {
      for (const ch of alphabet) {
        if (ch === CODE[i]) continue;
        const mutated = CODE.slice(0, i) + ch + CODE.slice(i + 1);
        expect(codeFromScan(mutated)).toBeNull();
        checked++;
      }
    }
    expect(checked).toBe(CODE.length * (alphabet.length - 1));
  });

  it("NEVER pulls a code out of the signature", () => {
    for (let v = 1; v <= 400; v++) {
      const payload = buildStudentQrPayload(OTHER, v);
      expect(codeFromScan(payload)).toBe(OTHER);
    }
  });

  it("refuses junk, empties and a URL with no payload", () => {
    for (const raw of [
      "",
      "   ",
      "hello",
      "https://edura.test/c/",
      "https://edura.test/",
      "/c/NOTACODE-1-AAAAAAAAAAAAAAAA",
    ]) {
      expect(codeFromScan(raw)).toBeNull();
    }
  });
});

describe("it agrees with the server", () => {
  it("returns exactly the code `parseStudentQr` returns, for every payload", () => {
    for (let v = 1; v <= 50; v++) {
      const url = buildStudentQrUrl(CODE, v);
      expect(codeFromScan(url)).toBe(parseStudentQr(url)?.code);
    }
  });

  it("still reads a code out of a payload the server calls FORGED", () => {
    const url = buildStudentQrUrl(CODE, 1);
    const forged = url.slice(0, -1) + (url.endsWith("0") ? "1" : "0");
    const parsed = parseStudentQr(forged);
    expect(parsed?.signatureValid).toBe(false);
    expect(codeFromScan(forged)).toBe(CODE);
  });
});
