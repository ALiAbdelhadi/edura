import { z } from "zod";

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

export const EGYPT_PHONE_RE = /^(?:\+20|0)1[0125]\d{8}$/;
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
export const signedMoneySchema = z
  .number()
  .int("Amount must be an integer (piasters)")
  .min(-MAX_MONEY_PIASTERS, "Amount below the minimum")
  .max(MAX_MONEY_PIASTERS, "Amount exceeds the maximum (999,999 EGP)");

export function isNotPastDate(yyyymmdd: string): boolean {
  return yyyymmdd >= new Date().toISOString().slice(0, 10);
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
