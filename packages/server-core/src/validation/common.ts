import { z } from "zod";
import { todayKey } from "../lib/date-key";
import { EGYPT_PHONE_RE } from "@repo/shared/phone";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((v) => /[A-Za-z]/.test(v), "Password must contain a letter")
  .refine((v) => /[0-9]/.test(v), "Password must contain a digit");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address");

export { EGYPT_PHONE_RE };
export const phoneSchema = z
  .string()
  .trim()
  .regex(EGYPT_PHONE_RE, "Invalid Egyptian phone number (expected 01XXXXXXXXX or +201XXXXXXXXX)");

export const nameSchema = z.string().trim().min(1).max(120);

export const localeSchema = z.enum(["ar", "en"]).optional();

export const MAX_MONEY_PIASTERS = 99_999_900;
export const moneySchema = z
  .number()
  .int("Amount must be an integer (piasters)")
  .min(0, "Amount cannot be negative")
  .max(MAX_MONEY_PIASTERS, "Amount exceeds the maximum (999,999 EGP)");
// `signedMoneySchema` was removed with the refund foundation (migration
// 20260906120000). Its only caller was POST /payments, where it let any
// negative amount down to -99,999,900 piasters through as a "refund"
// (REFUND_DECISION.md §1.7). Refunds now go to POST /payments/[id]/refund with
// a POSITIVE amount, and the sign belongs to the row the service writes. If a
// future money route needs a signed input, give it its own bounded schema
// rather than reviving a shared one that spans the whole range in both
// directions.

export function isNotPastDate(yyyymmdd: string): boolean {
  return yyyymmdd >= todayKey();
}
export const futureDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(isNotPastDate, "Date cannot be in the past");

export function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * The single pagination cap for every list endpoint in both apps.
 *
 * 100 rather than the 200 / 500 that some call sites used: no caller in
 * apps/erp or apps/superadmin ever asks for more than 100 (the largest is the
 * oversight tabs' `limit: "100"`), 100 was already the majority cap, and the
 * tighter of two bounds can only reduce worst-case database work.
 */
export const PAGE_LIMIT_MAX = 100;

function clampInt(
  value: string | number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = typeof value === "number" ? value : parseInt(value ?? "", 10);
  const n = Number.isFinite(raw) && raw !== 0 ? Math.trunc(raw) : fallback;
  return Math.min(max, Math.max(min, n));
}

export type PageLimitInput = {
  page?: string | number | null;
  limit?: string | number | null;
};

export type PageLimit = {
  page: number;
  limit: number;
  skip: number;
  take: number;
};

/**
 * Parses and clamps the `page` / `limit` query pair.
 *
 * A missing, non-numeric or zero value falls back to the default; anything
 * else is clamped into `[1, PAGE_LIMIT_MAX]`. `skip`/`take` are the Prisma
 * spelling of the same two numbers.
 */
export function parsePageLimit(
  input: PageLimitInput,
  defaultLimit = 20,
): PageLimit {
  const page = clampInt(input.page, 1, 1, Number.MAX_SAFE_INTEGER);
  const limit = clampInt(input.limit, defaultLimit, 1, PAGE_LIMIT_MAX);
  return { page, limit, skip: (page - 1) * limit, take: limit };
}
