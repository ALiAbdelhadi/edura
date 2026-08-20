import { withPlatformContext } from "../src/index";

/**
 * ============================================================================
 * PROVE THE APP YOU ARE ABOUT TO DRIVE IS ON THE DATABASE YOU JUST GUARDED
 * ============================================================================
 * Three demo seeds — settled-lessons, showcase-live, showcase-payments — are
 * not pure DB seeds. They sign in to a running app and drive it over HTTP:
 *
 *     POST {BASE_URL}/api/v1/sessions/{id}/complete     <- the settlement trigger
 *     POST {BASE_URL}/api/v1/center/subscriptions       <- money
 *
 * They also call `assertNotProduction()`. That guard inspects the label of the
 * database reached by DATABASE_URL — and the writes above do not go there. They
 * go to whatever app is listening on `ERP_BASE_URL`, which defaulted silently to
 * `http://localhost:3002`, attached to whatever database THAT process was
 * started with. So the guard could pass against a throwaway test database while
 * the money writes landed somewhere else entirely.
 *
 * This is the same hole the repo already closed once. From the docblock of
 * scripts/run-db-suites.ts, about the probe scripts that were deleted rather
 * than guarded:
 *
 *     "those writes travelled through the server's own connection, so no
 *      connection-string guard — this one or db-guard — could ever observe
 *      them."
 *
 * The fix is to make the connection the writes ACTUALLY use prove itself.
 *
 * WHY A NONCE AND NOT AN ID COMPARISON. The obvious check — fetch the centre
 * over HTTP and compare its id with the one we just read from the database —
 * proves nothing here, because `seedId()` mints deterministic UUIDv5 values:
 * SHOWCASE01 has the SAME id in dev, test and anywhere else the showcase seed
 * has run. Only a value that cannot have been produced independently
 * distinguishes the databases, so we write a fresh random one and require the
 * app to read it back.
 *
 * WHY NOTIFICATIONS. `GET /api/v1/notifications` already exists, is scoped to
 * the calling user (`where: { userId: user.id }`), and returns whole rows —
 * so the probe is visible to exactly one account, needs no new endpoint, and
 * touches nothing anyone is looking at. The row is deleted afterwards.
 * ============================================================================
 */

/** Thrown so a caller can distinguish "wrong target" from a network blip. */
export class HttpTargetMismatchError extends Error {}

function randomNonce(): string {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 1e9).toString(36),
  ).join("-");
}

/**
 * The base URL these seeds should drive.
 *
 * REQUIRED, with no default. The old `?? "http://localhost:3002"` meant running
 * a seed with any dev server up silently drove writes into whatever database
 * that server happened to hold — including, on a machine with the production
 * env symlinked, production. Naming the target is now a deliberate act.
 */
export function requireErpBaseUrl(seedName: string): string {
  const raw = process.env.ERP_BASE_URL;
  if (!raw) {
    throw new Error(
      `${seedName}: ERP_BASE_URL is required and has no default.\n` +
        "  This seed WRITES MONEY through a running app (session settlement,\n" +
        "  subscriptions), and the database it reaches is the one that app was\n" +
        "  started with — not necessarily the one db-guard just checked.\n" +
        "  Name it explicitly, e.g.:\n" +
        "      ERP_BASE_URL=http://localhost:3002 bun run seed:showcase-payments",
    );
  }
  try {
    new URL(raw);
  } catch {
    throw new Error(`${seedName}: ERP_BASE_URL is not a valid URL: ${raw}`);
  }
  return raw.replace(/\/+$/, "");
}

/**
 * Round-trip a fresh nonce through the app to prove it reads the database this
 * process is connected to. Throws `HttpTargetMismatchError` if it does not.
 *
 * `cookie` must already be an authenticated session for `userId` — the seeds
 * sign in before writing anything, so the probe costs one extra GET.
 */
export async function assertHttpTargetSharesDatabase(opts: {
  seedName: string;
  baseUrl: string;
  userId: string;
  cookie: string;
}): Promise<void> {
  const { seedName, baseUrl, userId, cookie } = opts;
  const nonce = randomNonce();
  const title = `seed-target-probe:${nonce}`;

  const probe = await withPlatformContext((tx) =>
    tx.notification.create({
      data: {
        userId,
        type: "admin_broadcast",
        title,
        body:
          "Written by a demo seed to verify it is driving the same database it " +
          "is connected to. Safe to ignore; removed automatically.",
      },
      select: { id: true },
    }),
  );

  try {
    const res = await fetch(
      `${baseUrl}/api/v1/notifications?limit=100&type=admin_broadcast`,
      { headers: { cookie } },
    );
    if (!res.ok) {
      throw new HttpTargetMismatchError(
        `${seedName}: could not read notifications back from ${baseUrl} ` +
          `(HTTP ${res.status}), so the target database could not be verified.`,
      );
    }
    const payload = (await res.json()) as { data?: { title?: string }[] };
    const seen = (payload.data ?? []).some((n) => n.title === title);

    if (!seen) {
      throw new HttpTargetMismatchError(
        `${seedName}: REFUSING TO RUN — the app at ${baseUrl} is NOT reading the ` +
          "database this seed is connected to.\n" +
          "  A row written here a moment ago was invisible there, so the two are\n" +
          "  different databases. db-guard checked THIS one; the writes would have\n" +
          "  gone to THAT one — and this seed writes money (settlement,\n" +
          "  subscriptions).\n" +
          "  Point ERP_BASE_URL at an app started with the same DATABASE_URL.",
      );
    }
  } finally {
    // Best-effort: the probe is noise in someone's notification list, but a
    // failure to clean it up must never mask the verdict above.
    await withPlatformContext((tx) =>
      tx.notification.deleteMany({ where: { id: probe.id } }),
    ).catch(() => {});
  }
}
