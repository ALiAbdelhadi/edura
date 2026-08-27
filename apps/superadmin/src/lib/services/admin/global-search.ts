import { platformDb } from "@/lib/db/scope";
import { listUsers } from "@/lib/services/admin/admin-users";
import { listPaymentIntents } from "@/lib/services/payments/payment-intents-admin";
import type { Role } from "@repo/database";
import type { SessionUser } from "@repo/server-core/auth/types";
import {
  matchesSearchTerms,
  narrowQuery,
  normalizeIdentifier,
  searchTerms,
  SEARCH_SCAN_LIMIT,
} from "@repo/database/search-text";
import {
  MIN_QUERY_LENGTH,
  PER_KIND,
  rankHits,
  type GlobalSearchResult,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
} from "@repo/server-core/services/search/global-search";

const ROLE_KIND: Record<string, SearchKind> = {
  student: "student",
  teacher: "teacher",
  parent: "parent",
  assistant: "assistant",
  center_admin: "center_admin",
  center_staff: "staff",
  super_admin: "back_office",
  accountant: "back_office",
};

const GROUP_ORDER: SearchKind[] = [
  "student",
  "teacher",
  "parent",
  "assistant",
  "center_admin",
  "staff",
  "back_office",
  "center",
  "payment_intent",
];

const CODE_SHAPE = /^[0-9A-HJ-NP-TV-Y]{8}$/i;

type Ctx = {
  q: string;
  portal: "superadmin" | "finance";
  terms: string[];
};

async function people(ctx: Ctx): Promise<SearchHit[]> {
  const [{ users }, byCode] = await Promise.all([
    listUsers({ q: ctx.q, take: SEARCH_SCAN_LIMIT }),
    resolveStudentCode(ctx.q),
  ]);

  const exact = users.filter((u) =>
    matchesSearchTerms([u.name, u.email, u.phone], ctx.terms),
  );

  const seen = new Set<string>();
  const rows: PersonRow[] = [...byCode, ...exact]
    .filter((u) => {
      if (seen.has(u.id)) return false;
      seen.add(u.id);
      return true;
    })
    .slice(0, PER_KIND * 4);

  return rows.map((u) => ({
    kind: ROLE_KIND[u.role] ?? "back_office",
    id: u.id,
    title: u.name,
    subtitle: u.email ?? u.phone ?? undefined,
    ...(u.code ? { badge: u.code } : {}),
    href: `/dashboard/superadmin/users/${u.id}`,
  }));
}

type PersonRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  code?: string | null;
};

async function resolveStudentCode(q: string): Promise<PersonRow[]> {
  const code = normalizeIdentifier(q);
  if (!CODE_SHAPE.test(code)) return [];
  return platformDb(async (tx) => {
    const profile = await tx.studentProfile.findFirst({
      where: { studentCode: code },
      select: {
        studentCode: true,
        user: {
          select: { id: true, name: true, email: true, phone: true, role: true },
        },
      },
    });
    if (!profile?.user) return [];
    return [{ ...profile.user, code: profile.studentCode }];
  });
}

async function centers(ctx: Ctx): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const candidates = await tx.center.findMany({
      where: {
        AND: narrowQuery(ctx.q, (f) => [
          { name: { contains: f, mode: "insensitive" as const } },
          { shortId: { contains: f, mode: "insensitive" as const } },
          { area: { contains: f, mode: "insensitive" as const } },
          { governorate: { contains: f, mode: "insensitive" as const } },
        ]),
      },
      select: {
        id: true,
        name: true,
        shortId: true,
        area: true,
        governorate: true,
      },
      orderBy: { createdAt: "desc" },
      take: SEARCH_SCAN_LIMIT,
    });
    const rows = candidates
      .filter((c) =>
        matchesSearchTerms([c.name, c.shortId, c.area, c.governorate], ctx.terms),
      )
      .slice(0, PER_KIND);

    return rows.map((c) => ({
      kind: "center" as const,
      id: c.id,
      title: c.name,
      subtitle: [c.area, c.governorate].filter(Boolean).join(" · ") || undefined,
      badge: c.shortId,
      href: `/dashboard/superadmin/centers/${c.id}`,
    }));
  });
}

async function paymentIntents(ctx: Ctx): Promise<SearchHit[]> {
  const { data } = await listPaymentIntents({
    q: ctx.q,
    limit: String(SEARCH_SCAN_LIMIT),
  });

  const rows = data
    .filter((intent) =>
      matchesSearchTerms(
        [
          intent.studentName,
          intent.studentEmail,
          intent.payerName,
          intent.gatewayRef,
          intent.gatewayOrderId,
          intent.idempotencyKey,
        ],
        ctx.terms,
      ),
    )
    .slice(0, PER_KIND);

  return rows.map((intent) => ({
    kind: "payment_intent" as const,
    id: intent.id,
    title: intent.studentName ?? intent.gatewayRef ?? intent.id.slice(0, 8),
    amount: intent.amount,
    ...(intent.gatewayRef ? { badge: intent.gatewayRef } : {}),
    href: `/dashboard/${ctx.portal}/payments?q=${encodeURIComponent(ctx.q)}`,
  }));
}

const PROVIDERS: {
  roles: readonly Role[];
  run: (ctx: Ctx) => Promise<SearchHit[]>;
}[] = [
  { roles: ["super_admin"], run: people },
  { roles: ["super_admin"], run: centers },
  { roles: ["super_admin", "accountant"], run: paymentIntents },
];

export async function backOfficeSearch(
  user: SessionUser,
  opts: { q: string },
): Promise<GlobalSearchResult> {
  const q = opts.q.trim();

  if (q.length < MIN_QUERY_LENGTH) return { q, groups: [], truncated: false };

  const portal = user.role === "accountant" ? "finance" : "superadmin";
  const ctx: Ctx = { q, portal, terms: searchTerms(q) };

  const runnable = PROVIDERS.filter((p) => p.roles.includes(user.role));
  if (!runnable.length) return { q, groups: [], truncated: false };

  const hits = (await Promise.all(runnable.map((p) => p.run(ctx)))).flat();

  const byKind = new Map<SearchKind, SearchHit[]>();
  for (const hit of hits) {
    const bucket = byKind.get(hit.kind);
    if (bucket) bucket.push(hit);
    else byKind.set(hit.kind, [hit]);
  }

  const groups: SearchGroup[] = [];
  for (const kind of GROUP_ORDER) {
    const bucket = byKind.get(kind);
    if (!bucket?.length) continue;
    groups.push({ kind, hits: rankHits(bucket, q).slice(0, PER_KIND) });
  }

  return {
    q,
    groups,
    truncated: groups.some((g) => g.hits.length >= PER_KIND),
  };
}
