import { randomBytes, createHash } from "node:crypto";

// Unambiguous alphabet: no 0/O/1/I.
const FAMILY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHORT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function pickFrom(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

export function generateFamilyCode(): string {
  return pickFrom(FAMILY_CODE_ALPHABET, 12);
}

export function generateCenterShortId(): string {
  return pickFrom(SHORT_ID_ALPHABET, 6);
}

// Short, human-shareable invite code for temp students (PRD §5.4).
export function generateInviteCode(): string {
  return pickFrom(SHORT_ID_ALPHABET, 8);
}

export function generateOpaqueToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
