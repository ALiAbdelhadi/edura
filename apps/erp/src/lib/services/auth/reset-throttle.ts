import { createHash } from "node:crypto";

/** 3 reset mails per address per hour, whatever the IP mix (SECURITY_AUDIT.md M-11a). */
export const PER_EMAIL_CAPACITY = 3;
export const PER_EMAIL_REFILL_PER_MINUTE = PER_EMAIL_CAPACITY / 60;

/** Bucket key for one address — hashed, so the limiter store never holds an email. */
export function resetEmailKey(normalizedEmail: string): string {
  return `reset-email:${createHash("sha256").update(normalizedEmail).digest("hex").slice(0, 32)}`;
}
