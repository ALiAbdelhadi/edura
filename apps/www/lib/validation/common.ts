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

// Egyptian mobile format (PRD §8.3): 01[0125]XXXXXXXX, optionally +20-prefixed.
// Accepts a leading +20 or 0, an operator prefix (10/11/12/15), then 8 digits.
export const EGYPT_PHONE_RE = /^(?:\+20|0)1[0125]\d{8}$/;
export const phoneSchema = z
  .string()
  .trim()
  .regex(EGYPT_PHONE_RE, "Invalid Egyptian phone number (expected 01XXXXXXXXX or +201XXXXXXXXX)");

export const nameSchema = z.string().trim().min(1).max(120);

export const localeSchema = z.enum(["ar", "en"]).optional();

// Money is stored as integer minor units (piasters). PRD §8.3: 0 .. 99,999,900.
export const MAX_MONEY_PIASTERS = 99_999_900;
export const moneySchema = z
  .number()
  .int("Amount must be an integer (piasters)")
  .min(0, "Amount cannot be negative")
  .max(MAX_MONEY_PIASTERS, "Amount exceeds the maximum (999,999 EGP)");
// Signed variant for ledgers that allow refunds (negative) e.g. payments.
export const signedMoneySchema = z
  .number()
  .int("Amount must be an integer (piasters)")
  .min(-MAX_MONEY_PIASTERS, "Amount below the minimum")
  .max(MAX_MONEY_PIASTERS, "Amount exceeds the maximum (999,999 EGP)");

// PRD §8.3: reject past dates for new lessons/sessions. Compares a YYYY-MM-DD
// string against today (UTC; Egypt is UTC+2 so "today" is never wrongly rejected).
export function isNotPastDate(yyyymmdd: string): boolean {
  return yyyymmdd >= new Date().toISOString().slice(0, 10);
}
// A YYYY-MM-DD string that must be today or later.
export const futureDateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD")
  .refine(isNotPastDate, "Date cannot be in the past");

// Sessions are stored at UTC midnight; use this (not `new Date()`) when
// selecting "today and future" sessions so today's are not skipped.
export function startOfTodayUTC(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
