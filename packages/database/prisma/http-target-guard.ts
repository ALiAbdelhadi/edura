import { withPlatformContext } from "../src/index";

export class HttpTargetMismatchError extends Error {}

function randomNonce(): string {
  return Array.from({ length: 4 }, () =>
    Math.floor(Math.random() * 1e9).toString(36),
  ).join("-");
}

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
    await withPlatformContext((tx) =>
      tx.notification.deleteMany({ where: { id: probe.id } }),
    ).catch(() => {});
  }
}
