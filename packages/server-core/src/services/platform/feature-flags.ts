import { platformDb } from "../../db/scope";
import { BusinessRuleError } from "../../errors/classes";

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

const KEY_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

const CACHE_TTL_MS = 30_000;
type CacheEntry = { value: boolean; readAt: number };
const cache = new Map<string, CacheEntry>();

export function clearFeatureFlagCache(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

export type FlagOptions = {
  fallbackWhenMissing?: boolean;
};

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
    return fallback;
  }
}

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
  persisted: boolean;
};

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
