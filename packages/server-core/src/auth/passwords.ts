import bcrypt from "bcryptjs";

/**
 * THE single bcrypt implementation for both apps' better-auth instances.
 *
 * `users.password_hash` (bcrypt, cost 10) is the source of truth; the
 * better-auth credential rows in `auth_accounts` mirror it via DB triggers
 * (migration 20260801170000_better_auth). Existing hashes verify as-is —
 * migrating off next-auth forced NO password resets.
 */
export const BCRYPT_COST = 10;

/**
 * H5: a valid bcrypt hash of a random string. Compared against when the
 * account is missing/ineligible so login timing is identical to a real
 * wrong-password attempt (no email-enumeration timing oracle). Never matches
 * a real password. (Moved verbatim from both apps' NextAuth options.)
 */
export const DUMMY_HASH =
  "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/** Signature matches better-auth's emailAndPassword.password.verify. */
export function verifyPassword(data: {
  hash: string;
  password: string;
}): Promise<boolean> {
  return bcrypt.compare(data.password, data.hash);
}
