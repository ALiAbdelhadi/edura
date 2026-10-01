export const STUDENT_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXY";

export const STUDENT_CODE_MODULUS = STUDENT_CODE_ALPHABET.length; // 31
export const STUDENT_CODE_BODY_LENGTH = 6;
export const STUDENT_CODE_LENGTH = 8;

export const PENDING_SYSTEM_LETTER = "X";

const CONFUSABLES: Record<string, string> = {
  I: "1",
  L: "1",
  O: "0",
};

function valueOf(char: string): number {
  return STUDENT_CODE_ALPHABET.indexOf(char);
}

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

export function buildStudentCode(systemLetter: string, body: string): string {
  const letter = systemLetter.toUpperCase();
  if (valueOf(letter) < 0) throw new Error(`system letter out of alphabet: ${systemLetter}`);
  if (body.length !== STUDENT_CODE_BODY_LENGTH) {
    throw new Error(`body must be ${STUDENT_CODE_BODY_LENGTH} characters`);
  }
  const head = letter + body.toUpperCase();
  return head + studentCodeCheckChar(head);
}

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

export function resolveStudentCode(raw: string): string | null {
  const code = normalizeStudentCode(raw);
  if (!code) return null;
  return studentCodeCheckChar(code.slice(0, -1)) === code.slice(-1) ? code : null;
}

export function isValidStudentCode(raw: string): boolean {
  return resolveStudentCode(raw) !== null;
}

export function isPendingStudentCode(code: string): boolean {
  return code.toUpperCase().startsWith(PENDING_SYSTEM_LETTER);
}

export function formatStudentCode(code: string): string {
  const c = (normalizeStudentCode(code) ?? code.toUpperCase()).trim();
  if (c.length !== STUDENT_CODE_LENGTH) return c;
  return `${c.slice(0, 4)}-${c.slice(4)}`;
}

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
