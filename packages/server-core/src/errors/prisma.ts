import { Prisma } from "@repo/database";

/**
 * The name of the unique index a P2002 violated, or null when it cannot be read.
 *
 * MEASURED, not assumed (2026-09-02, test branch, Prisma 7.10 on the Neon driver
 * adapter): this stack does NOT populate `meta.target`. The constraint name
 * arrives only inside the adapter's own cause:
 *
 *   meta.driverAdapterError.cause.originalMessage
 *     = 'duplicate key value violates unique constraint "wallet_settings_one_row"'
 *
 * and `cause.constraint.fields` is useless for an expression index -- it reported
 * `["(true"]` for `wallet_settings_one_row`. So the message is parsed, with
 * `meta.target` still checked first because that is what Prisma documents and
 * what a future version (or a different adapter) may go back to emitting.
 *
 * Returning null rather than guessing is deliberate: a caller that cannot
 * identify the constraint must let the raw P2002 surface as a generic 409 rather
 * than claim a specific domain conflict that may not be the one that fired.
 */
export function uniqueConstraintName(err: unknown): string | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return null;
  }
  const meta = err.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { originalMessage?: unknown; constraint?: { index?: unknown } } };
      }
    | undefined;

  const target = meta?.target;
  if (typeof target === "string") return target;
  if (Array.isArray(target) && target.every((t) => typeof t === "string")) return target.join("_");

  const cause = meta?.driverAdapterError?.cause;
  if (typeof cause?.constraint?.index === "string") return cause.constraint.index;

  const message = cause?.originalMessage;
  if (typeof message === "string") {
    const match = /unique constraint "([^"]+)"/.exec(message);
    if (match) return match[1];
  }
  return null;
}

/**
 * True when `err` is Prisma's unique-constraint violation (P2002).
 *
 * Pass `index` to narrow to ONE constraint. A table can carry several unique
 * indexes, and "that row already exists" is only the right message for the one
 * the writer was racing on -- turning an unrelated violation into a friendly
 * domain error would hide a real bug.
 */
export function isUniqueViolation(err: unknown, index?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") {
    return false;
  }
  if (!index) return true;
  return uniqueConstraintName(err) === index;
}
