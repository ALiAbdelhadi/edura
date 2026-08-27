import { describe, expect, it } from "vitest";
import {
  PENDING_SYSTEM_LETTER,
  STUDENT_CODE_ALPHABET,
  STUDENT_CODE_LENGTH,
  buildStudentCode,
  formatStudentCode,
  isPendingStudentCode,
  isValidStudentCode,
  normalizeStudentCode,
  resolveStudentCode,
  studentCodeBodyFromDigest,
  studentCodeCheckChar,
} from "@repo/database/student-code";

const SAMPLE_CODES = [
  buildStudentCode("G", "7K3M2Q"),
  buildStudentCode("A", "000000"),
  buildStudentCode("B", "YYYYYY"),
  buildStudentCode("X", "1V9T4C"),
  buildStudentCode("G", "M2N5PR"),
];

describe("shape", () => {
  it("is eight characters, all inside the alphabet", () => {
    for (const code of SAMPLE_CODES) {
      expect(code).toHaveLength(STUDENT_CODE_LENGTH);
      for (const ch of code) expect(STUDENT_CODE_ALPHABET).toContain(ch);
    }
  });

  it("excludes every character a human confuses — I, L, O, U and Z", () => {
    for (const ch of "ILOUZ") expect(STUDENT_CODE_ALPHABET).not.toContain(ch);
  });

  it("has a PRIME alphabet size — the check character's guarantee rests on it", () => {
    const n = STUDENT_CODE_ALPHABET.length;
    expect(n).toBe(31);
    for (let d = 2; d * d <= n; d++) expect(n % d).not.toBe(0);
  });

  it("builds a code whose own check character validates it", () => {
    for (const code of SAMPLE_CODES) {
      expect(studentCodeCheckChar(code.slice(0, 7))).toBe(code.slice(7));
      expect(isValidStudentCode(code)).toBe(true);
    }
  });
});

describe("the check character", () => {
  it("rejects EVERY single-character mistype", () => {
    let checked = 0;
    for (const code of SAMPLE_CODES) {
      for (let i = 0; i < code.length; i++) {
        for (const ch of STUDENT_CODE_ALPHABET) {
          if (ch === code[i]) continue;
          const typo = code.slice(0, i) + ch + code.slice(i + 1);
          expect(isValidStudentCode(typo)).toBe(false);
          checked++;
        }
      }
    }
    expect(checked).toBe(1200);
  });

  it("rejects EVERY swap of two adjacent characters", () => {
    let swaps = 0;
    for (const code of SAMPLE_CODES) {
      for (let i = 0; i < code.length - 1; i++) {
        if (code[i] === code[i + 1]) continue;
        const swapped =
          code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
        expect(isValidStudentCode(swapped)).toBe(false);
        swaps++;
      }
    }
    expect(swaps).toBeGreaterThan(20);
  });
});

describe("normalization — what the counter actually receives", () => {
  const code = buildStudentCode("G", "7K3M2Q");

  it("accepts the printed grouping, lowercase and stray spacing", () => {
    expect(resolveStudentCode(formatStudentCode(code))).toBe(code);
    expect(resolveStudentCode(code.toLowerCase())).toBe(code);
    expect(resolveStudentCode(`  ${code}  `)).toBe(code);
    expect(resolveStudentCode(`${code.slice(0, 4)} ${code.slice(4)}`)).toBe(code);
  });

  it("maps the confusables a human types instead of the real character", () => {
    const withOnes = buildStudentCode("G", "1V9T4C");
    expect(resolveStudentCode(withOnes.replace("1", "I"))).toBe(withOnes);
    expect(resolveStudentCode(withOnes.replace("1", "l"))).toBe(withOnes);

    const withZero = buildStudentCode("A", "0R5W8T");
    expect(resolveStudentCode(withZero.replace("0", "O"))).toBe(withZero);
  });

  it("returns null — never a guess — for anything that is not a code", () => {
    expect(resolveStudentCode("")).toBeNull();
    expect(resolveStudentCode("أحمد")).toBeNull();
    expect(resolveStudentCode("STU-000123")).toBeNull(); // the retired format
    expect(resolveStudentCode("01012345678")).toBeNull(); // a phone
    expect(resolveStudentCode(code.slice(0, 7))).toBeNull(); // too short
    expect(resolveStudentCode(`${code}A`)).toBeNull(); // too long
    expect(normalizeStudentCode("ZZZZZZZZ")).toBeNull(); // Z is not in the alphabet
  });
});

describe("issuance", () => {
  it("marks a code pending only while it carries the placeholder letter", () => {
    expect(isPendingStudentCode(buildStudentCode(PENDING_SYSTEM_LETTER, "7K3M2Q"))).toBe(true);
    expect(isPendingStudentCode(buildStudentCode("G", "7K3M2Q"))).toBe(false);
    expect(isPendingStudentCode(buildStudentCode("A", "7K3M2Q"))).toBe(false);
  });

  it("derives the body from a digest, deterministically", () => {
    const digest = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const body = studentCodeBodyFromDigest(digest);
    expect(body).toHaveLength(6);
    expect(studentCodeBodyFromDigest(digest)).toBe(body);
    for (const ch of body) expect(STUDENT_CODE_ALPHABET).toContain(ch);
  });

  it("carries nothing personal — a different digest is a different code, and only that", () => {
    const a = studentCodeBodyFromDigest(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 9]));
    const b = studentCodeBodyFromDigest(new Uint8Array([9, 9, 9, 9, 9, 9, 9, 8]));
    expect(a).not.toBe(b);
  });

  it("refuses a system letter outside the alphabet", () => {
    expect(() => buildStudentCode("Z", "7K3M2Q")).toThrow();
    expect(() => buildStudentCode("O", "7K3M2Q")).toThrow();
  });
});

describe("display", () => {
  it("groups for the eye without changing the stored value", () => {
    const code = buildStudentCode("G", "7K3M2Q");
    expect(formatStudentCode(code)).toBe(`${code.slice(0, 4)}-${code.slice(4)}`);
    expect(resolveStudentCode(formatStudentCode(code))).toBe(code);
  });
});
