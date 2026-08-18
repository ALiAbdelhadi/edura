// Proof for `codeFromScan` — the browser-side half of reading a scanned card.
//
// This is the function that decides WHICH STUDENT a camera just looked at, on
// two screens that then mark somebody present: the hall door and the teacher's
// attendance roster. It has no access to `STUDENT_QR_SECRET`, so it cannot and
// does not judge whether a card is genuine — that stays on the server. What it
// must never do is resolve to the WRONG child, and there are exactly three
// ways it could:
//
//   1. by accepting a code whose CHECK CHARACTER disagrees (student-code v2
//      exists so that one misread character fails instead of landing on a
//      neighbour),
//   2. by finding a code-shaped run of characters inside the SIGNATURE, which
//      is 16 symbols of the same alphabet sitting in the same string,
//   3. by silently disagreeing with the server's `parseStudentQr`, which reads
//      the same payload with different code.
//
// (3) is the one a reviewer cannot see, so the last block asserts the two
// agree on the same inputs rather than trusting that they were written to.
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
    // A trailing slash is what a phone's browser normalises some URLs to.
    expect(codeFromScan(`${url}/`)).toBe(CODE);
  });

  it("applies the Crockford substitutions a human typing makes", () => {
    // O→0, I→1, L→1 — the operator types what the card LOOKS like.
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
    // Every single-character change to a real code. Each one must fail rather
    // than resolve — this is the guarantee the whole eight-character scheme
    // was rebuilt for, and it has to hold on the scan path too.
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
    // The signature is 16 symbols of an overlapping alphabet. Taking the
    // payload's FIRST segment rather than searching the string is what stops a
    // valid-looking run inside it from winning; 400 real payloads is enough to
    // hit the coincidence if the implementation ever regresses to a search.
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
    // The two live in different packages and cannot share an implementation —
    // one needs node:crypto, the other runs in a browser. So the contract is
    // asserted instead of shared.
    for (let v = 1; v <= 50; v++) {
      const url = buildStudentQrUrl(CODE, v);
      expect(codeFromScan(url)).toBe(parseStudentQr(url)?.code);
    }
  });

  it("still reads a code out of a payload the server calls FORGED", () => {
    // Deliberate, and the reason is easy to get backwards. The client resolves
    // a card against a list the operator may already act on, so a forgery buys
    // nothing there — while refusing to even NAME the student would mean an
    // operator holding a real card gets "not on this list" when the true
    // problem is a bad signature the server is about to report properly.
    const url = buildStudentQrUrl(CODE, 1);
    const forged = url.slice(0, -1) + (url.endsWith("0") ? "1" : "0");
    const parsed = parseStudentQr(forged);
    expect(parsed?.signatureValid).toBe(false);
    expect(codeFromScan(forged)).toBe(CODE);
  });
});
