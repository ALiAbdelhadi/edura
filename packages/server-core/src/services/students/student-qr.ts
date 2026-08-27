import { createHmac, timingSafeEqual } from "node:crypto";
import { appBaseUrl } from "../../http/app-url";
import { STUDENT_CODE_LENGTH, resolveStudentCode } from "@repo/database/student-code";

const SIG_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const SIG_LENGTH = 16;

export const STUDENT_QR_PATH = "c";

const PAYLOAD_PATTERN = new RegExp(
  `^([0-9A-Z]{${STUDENT_CODE_LENGTH}})-(\\d{1,4})-([${SIG_ALPHABET}]{${SIG_LENGTH}})$`,
);

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

function signatureFor(code: string, version: number): string {
  const mac = createHmac("sha256", qrSecret());
  mac.update(`edura.student-card.v1|${code}|${version}`);
  return encodeSignature(mac.digest());
}

export function buildStudentQrPayload(code: string, version: number): string {
  const normalized = resolveStudentCode(code);
  if (!normalized) throw new Error(`not a student code: ${code}`);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`qr version must be a positive integer, got ${version}`);
  }
  return `${normalized}-${version}-${signatureFor(normalized, version)}`;
}

export function buildStudentQrUrl(code: string, version: number): string {
  return `${appBaseUrl()}/${STUDENT_QR_PATH}/${buildStudentQrPayload(code, version)}`;
}

export type ParsedStudentQr = {
  code: string;
  version: number;
  signatureValid: boolean;
};

export function parseStudentQr(raw: string): ParsedStudentQr | null {
  if (!raw) return null;
  let text = raw.trim();

  if (text.includes("/")) {
    const withoutQuery = text.split(/[?#]/)[0] as string;
    const segments = withoutQuery.split("/").filter(Boolean);
    text = segments.at(-1) ?? "";
  }

  const match = PAYLOAD_PATTERN.exec(text.toUpperCase());
  if (!match) return null;

  const [, rawCode, rawVersion, signature] = match as unknown as [
    string,
    string,
    string,
    string,
  ];

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

export type StudentScan =
  | { kind: "signed"; code: string; version: number }
  | { kind: "scanned_code"; code: string }
  | { kind: "forged"; code: string; version: number }
  | { kind: "unreadable" };

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
