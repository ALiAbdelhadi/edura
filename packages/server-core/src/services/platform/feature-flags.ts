import { platformDb } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

// ===========================================================================
// FEATURE FLAGS — DB-backed switches, deliberately DEFAULT-CLOSED.
//
// Three properties, each chosen rather than inherited:
//
// 1. ABSENT MEANS OFF. `isFeatureEnabled("anything.at.all")` on an empty table
//    returns false. A typo'd key, a row someone deleted, an environment nobody
//    seeded — every one of those fails to "not available" instead of silently
//    exposing a half-built surface. Callers that need the opposite must say so
//    out loud with `{ fallbackWhenMissing: true }`, which reads as the unusual
//    thing it is.
//
// 2. THE CACHE CANNOT OUTLIVE A REQUEST. Flags are read on hot paths, so they
//    are memoised — but only for CACHE_TTL_MS, and the toggle write clears the
//    cache in the same call. An operator who flips a kill switch during an
//    incident must not be told to wait for a TTL.
//
// 3. A FAILING DATABASE DOES NOT OPEN A FLAG. If the read throws, the answer
//    is the fallback (false by default), never "assume enabled". A flag is
//    most often protecting something not ready to be seen; the failure mode
//    that matters is the one where an outage turns it on.
//
// This module is NOT an authorization mechanism. A flag decides whether a
// feature is available at all; it never decides whether *this* user may use
// it. Role checks stay where they are.
// ===========================================================================

/** Flags referenced from code. Listing them here is what makes the toggle UI
 *  useful: an operator sees every switch the product has, including ones no
 *  row exists for yet, instead of guessing key names. */
export const KNOWN_FEATURE_FLAGS = [
  {
    key: "receipts.pdf",
    description: "Downloadable PDF receipts from payment history",
  },
  {
    key: "data_rights.export",
    description: "Self-serve “export my data” requests (قانون 151/2020)",
  },
  {
    key: "data_rights.deletion",
    description: "Self-serve account-deletion requests",
  },
  {
    key: "center.audit_log",
    description: "Audit-log viewer inside the center owner's portal",
  },
] as const;

export type KnownFlagKey = (typeof KNOWN_FEATURE_FLAGS)[number]["key"];

/** A key is a stable machine identifier — lowercase, dotted, no spaces. */
const KEY_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const CACHE_TTL_MS = 30_000;
type CacheEntry = { value: boolean; readAt: number };
const cache = new Map<string, CacheEntry>();

/** Drop the memo. Called by every write here; exported for tests and for any
 *  future out-of-band flip (a seed, a migration, a console). */
export function clearFeatureFlagCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export type FlagOptions = {
  /**
   * What to answer when the key has NO ROW AT ALL. Defaults to false.
   * Set true only for a flag that gates something already shipped, where the
   * row's job is to be a kill switch rather than a release gate.
   */
  fallbackWhenMissing?: boolean;
};

/**
 * THE read. Safe to call anywhere, including from a render path — it never
 * throws and never blocks longer than one indexed lookup.
 */
export async function isFeatureEnabled(key: string, opts: FlagOptions = {}): Promise<boolean> {
  const fallback = opts.fallbackWhenMissing ?? false;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.readAt < CACHE_TTL_MS) return hit.value;

  try {
    const row = await platformDb((tx) =>
      tx.featureFlag.findUnique({ where: { key }, select: { enabled: true } }),
    );
    const value = row ? row.enabled : fallback;
    cache.set(key, { value, readAt: Date.now() });
    return value;
  } catch {
    // A database that cannot answer must not be read as "yes".
    return fallback;
  }
}

/** Batch form for a screen that needs several flags — one query, not N. */
export async function readFeatureFlags(keys: string[]): Promise<Record<string, boolean>> {
  if (keys.length === 0) return {};
  try {
    const rows = await platformDb((tx) =>
      tx.featureFlag.findMany({ where: { key: { in: keys } }, select: { key: true, enabled: true } }),
    );
    const byKey = new Map(rows.map((r) => [r.key, r.enabled]));
    return Object.fromEntries(keys.map((k) => [k, byKey.get(k) ?? false]));
  } catch {
    return Object.fromEntries(keys.map((k) => [k, false]));
  }
}

export type FlagRow = {
  key: string;
  description: string | null;
  enabled: boolean;
  note: string | null;
  updatedBy: string | null;
  updatedAt: Date | null;
  /** false = no row exists yet, so this flag is reading as its fallback. */
  persisted: boolean;
};

/**
 * Every flag the operator can act on: the rows that exist, UNIONed with the
 * keys code knows about. A known key with no row is listed as disabled and
 * `persisted: false`, which is the honest description of its state — the UI
 * says "never set" rather than pretending someone turned it off.
 */
export async function listFeatureFlags(): Promise<FlagRow[]> {
  const rows = await platformDb((tx) =>
    tx.featureFlag.findMany({ orderBy: { key: "asc" } }),
  );
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const merged: FlagRow[] = rows.map((r) => ({
    key: r.key,
    description: r.description,
    enabled: r.enabled,
    note: r.note,
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt,
    persisted: true,
  }));

  for (const known of KNOWN_FEATURE_FLAGS) {
    if (byKey.has(known.key)) continue;
    merged.push({
      key: known.key,
      description: known.description,
      enabled: false,
      note: null,
      updatedBy: null,
      updatedAt: null,
      persisted: false,
    });
  }

  return merged.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Flip a flag. Upsert, so an operator can enable a key that has never been
 * stored without a separate "create" step.
 *
 * The audit row is written in the SAME transaction as the flip: a switch that
 * changed with nobody's name on it is the thing an incident review cannot use.
 */
export async function setFeatureFlag(
  actorId: string,
  key: string,
  enabled: boolean,
  opts: { note?: string; description?: string } = {},
): Promise<FlagRow> {
  if (!KEY_RE.test(key)) {
    throw new BusinessRuleError(
      "A feature-flag key must be lowercase, dotted, and free of spaces (e.g. receipts.pdf)",
    );
  }

  const known = KNOWN_FEATURE_FLAGS.find((f) => f.key === key);
  const description = opts.description ?? known?.description ?? null;

  const row = await platformDb(async (tx) => {
    const before = await tx.featureFlag.findUnique({ where: { key } });

    const saved = await tx.featureFlag.upsert({
      where: { key },
      create: {
        key,
        enabled,
        description,
        note: opts.note ?? null,
        updatedBy: actorId,
      },
      update: {
        enabled,
        note: opts.note ?? null,
        updatedBy: actorId,
        ...(description ? { description } : {}),
      },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "feature_flag.updated",
        targetType: "feature_flag",
        // The key is the identity here; target_id is a uuid column and a flag
        // key is not one, so the key travels in the state payloads instead.
        targetId: null,
        beforeState: before
          ? ({ key, enabled: before.enabled, note: before.note } as never)
          : ({ key, enabled: null, note: null, persisted: false } as never),
        afterState: { key, enabled, note: opts.note ?? null } as never,
        onBehalfOf: null,
      },
    });

    return saved;
  });

  clearFeatureFlagCache(key);

  return {
    key: row.key,
    description: row.description,
    enabled: row.enabled,
    note: row.note,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
    persisted: true,
  };
}
