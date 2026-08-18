import { platformDb } from "@/lib/db/scope";
import { listUsers } from "@/lib/services/admin/admin-users";
import { listPaymentIntents } from "@/lib/services/payments/payment-intents-admin";
import type { Role } from "@repo/database";
import type { SessionUser } from "@repo/server-core/auth/types";
import {
  MIN_QUERY_LENGTH,
  PER_KIND,
  rankHits,
  type GlobalSearchResult,
  type SearchGroup,
  type SearchHit,
  type SearchKind,
} from "@repo/server-core/services/search/global-search";

/* ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL SEARCH — the back office half.
 *
 * The ⌘K palette in this app searched twenty-one DESTINATIONS. It now also
 * finds the RECORD: any person on the platform, any center, any online payment
 * attempt. For a super admin that is the single most-used question there is —
 * "someone rang about a student called Mariam" — and it used to cost a
 * navigation to Users plus a second search inside it.
 *
 * ── WHY THIS IS A SECOND IMPLEMENTATION AND NOT A SHARED ONE ────────────────
 *
 * It emits the SAME contract as `@repo/server-core/.../global-search`
 * (`SearchHit`, `SearchGroup`, the min-length rule and `rankHits`, all imported
 * from there) but owns its own providers, because what it reads is genuinely
 * different: the ERP kernel reads ONE TENANT through `scopedDb`, and this reads
 * THE PLATFORM through `platformDb`. Folding the two into one function would
 * mean the shared kernel importing this app's services, and — worse — one
 * `where` clause whose tenancy depended on a flag. A tenancy that is a
 * parameter is a tenancy someone eventually passes wrong.
 *
 * What IS shared is everything a reader can perceive: the row shape, the
 * ordering, and the two-character floor.
 *
 * ── IT ADDS NO REACH, AND NO QUIETER DOOR ───────────────────────────────────
 *
 * Each provider calls the service its own list SCREEN already calls, under the
 * same `requireRole`. Two consequences worth stating because they are the whole
 * safety argument:
 *
 *   · `listUsers` and `listPaymentIntents` are used AS-IS, so a search cannot
 *     match on a column the list screen would not, and cannot return a row the
 *     list would hide (soft-deleted users are excluded by the client extension,
 *     for both).
 *   · NOTHING AUDITED IS REACHED FROM HERE. `buildStudentCard` writes
 *     `student.card_viewed` in the same transaction as its read precisely so a
 *     card view leaves a trace; a search that surfaced card data would be a
 *     second, quieter door onto an audited read. This module touches no audited
 *     surface, moves no money, and imports nothing that mutates.
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A person's ROLE is their group heading. Kinds, not one flat "user": the back
 * office's directory is mostly names, and "Teachers / Students / Parents" is
 * what makes a list of twelve of them scannable.
 */
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

/** Group order in the palette. Not alphabetical — the order the back office
 *  actually fields questions in: people first, then the centers they belong
 *  to, then the money that moved. */
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

/** Enough characters for the search to be about a person rather than a letter. */
const CODE_SHAPE = /^[0-9A-HJ-NP-TV-Y]{8}$/i;

type Ctx = { q: string; portal: "superadmin" | "finance" };

/* ─────────────────────────────────────────────────────────────────────────
 * People
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Every role, in one query, grouped by role on the way out.
 *
 * PLUS one thing the users list cannot do: resolve a STUDENT CODE. `listUsers`
 * matches name / email / phone, and the code is on `student_profiles`, so a
 * receptionist who rings the back office reading `G7K3M2QF` off a card had no
 * way to be helped from the one box. That is not a widening — it lands on a
 * user this role can already list, reached by an identifier the caller was
 * given — it is the missing key on an existing door.
 */
async function people(ctx: Ctx): Promise<SearchHit[]> {
  // A generous take: the result is split across up to seven role groups, so a
  // cap of five would silently drop whole roles from a common name.
  const [{ users }, byCode] = await Promise.all([
    listUsers({ q: ctx.q, take: PER_KIND * 4 }),
    resolveStudentCode(ctx.q),
  ]);

  // The code hit goes FIRST and wins the dedup: it is the only one of the two
  // that carries the code to draw as a badge, and it is the more specific
  // match — someone who typed eight characters of Crockford base32 meant that
  // student, not the four others whose email happens to contain the substring.
  const seen = new Set<string>();
  const rows: PersonRow[] = [...byCode, ...users].filter((u) => {
    if (seen.has(u.id)) return false;
    seen.add(u.id);
    return true;
  });

  return rows.map((u) => ({
    kind: ROLE_KIND[u.role] ?? "back_office",
    id: u.id,
    title: u.name,
    // Email over phone: it is what the back office is given on a support call,
    // and it is the column `listUsers` matched on.
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
  const code = q.trim().toUpperCase();
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

/* ─────────────────────────────────────────────────────────────────────────
 * Centers
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * `listCenters` filters by status and pages; it has no `q`, so this is the one
 * provider written from scratch. It reads the same table, under `platformDb`,
 * and returns nothing the centers list would not — including the short id,
 * which is what a center is actually referred to by over the phone.
 */
async function centers(ctx: Ctx): Promise<SearchHit[]> {
  return platformDb(async (tx) => {
    const rows = await tx.center.findMany({
      where: {
        OR: [
          { name: { contains: ctx.q, mode: "insensitive" } },
          { shortId: { contains: ctx.q, mode: "insensitive" } },
          { area: { contains: ctx.q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        shortId: true,
        area: true,
        governorate: true,
      },
      orderBy: { createdAt: "desc" },
      take: PER_KIND,
    });

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

/* ─────────────────────────────────────────────────────────────────────────
 * Money — the ONE provider the accountant holds
 * ───────────────────────────────────────────────────────────────────────── */

/**
 * Online payment attempts, by payer name or by a gateway reference.
 *
 * THE HIT LANDS ON THE LIST, SEEDED, not on a record page — the intents screen
 * has no detail route, it has a drawer keyed to a row it is already showing. So
 * the href carries `?q=` and the screen opens with the same search already run.
 * That is honest: the palette got the operator to the right screen with the
 * right filter, which is the whole job.
 *
 * `apiBase` on that screen is what makes ONE provider serve both portals: the
 * accountant's copy reads `/api/v1/finance/payment-intents` and the super
 * admin's reads `/api/v1/admin/…`, both `requireRole("accountant",
 * "super_admin")`, both the same service.
 */
async function paymentIntents(ctx: Ctx): Promise<SearchHit[]> {
  const { data } = await listPaymentIntents({ q: ctx.q, limit: String(PER_KIND) });

  return data.map((intent) => ({
    kind: "payment_intent" as const,
    id: intent.id,
    // The payer, when the row has one. A parent wallet top-up has no
    // beneficiary student, so the reference is the only name it has.
    title: intent.studentName ?? intent.gatewayRef ?? intent.id.slice(0, 8),
    amount: intent.amount,
    ...(intent.gatewayRef ? { badge: intent.gatewayRef } : {}),
    href: `/dashboard/${ctx.portal}/payments?q=${encodeURIComponent(ctx.q)}`,
  }));
}

/* ═══════════════════════════════════════════════════════════════════════════
 * THE BOUNDARY, in one readable table.
 *
 * `roles` is the SAME allow-list the provider's own route carries. Read it
 * beside those routes: a disagreement here is a privilege escalation, not a bug
 * in a list. The accountant holds exactly one provider, and that is not an
 * oversight — the finance portal's other screens (payouts, subscriptions,
 * commission) carry no per-record destination and no identifier a human reads
 * aloud, so a hit for them would have nowhere honest to land.
 * ═══════════════════════════════════════════════════════════════════════════ */
const PROVIDERS: {
  roles: readonly Role[];
  run: (ctx: Ctx) => Promise<SearchHit[]>;
}[] = [
  // `/api/v1/admin/users` — requireRole("super_admin")
  { roles: ["super_admin"], run: people },
  // `/api/v1/admin/centers` — requireRole("super_admin")
  { roles: ["super_admin"], run: centers },
  // `/api/v1/{admin,finance}/payment-intents` — requireRole("accountant", "super_admin")
  { roles: ["super_admin", "accountant"], run: paymentIntents },
];

export async function backOfficeSearch(
  user: SessionUser,
  opts: { q: string },
): Promise<GlobalSearchResult> {
  const q = opts.q.trim();

  // Short-circuits BEFORE any query, on the shared floor: a one-character
  // search is not a search, and three providers per keystroke of a word is how
  // a back office becomes slow at the moment somebody is on the phone.
  if (q.length < MIN_QUERY_LENGTH) return { q, groups: [], truncated: false };

  const portal = user.role === "accountant" ? "finance" : "superadmin";
  const ctx: Ctx = { q, portal };

  const runnable = PROVIDERS.filter((p) => p.roles.includes(user.role));
  if (!runnable.length) return { q, groups: [], truncated: false };

  const hits = (await Promise.all(runnable.map((p) => p.run(ctx)))).flat();

  // Bucket by kind, then emit in GROUP_ORDER. Ordering the groups by hand
  // rather than by arrival keeps the palette's shape stable between searches —
  // a list whose sections reorder because one provider answered first is one
  // nobody builds muscle memory for.
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
