import type { ContactSubmissionStatus, Prisma } from "@repo/database";
import { exactQuery } from "@repo/database/search-text";
import type { SessionUser } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";

// ===========================================================================
// CONTACT INBOX — READ-ONLY over what the public site collected.
//
// The boundary is narrow on purpose. A submission is a message a member of the
// public sent us; the back office may READ it and may record that someone
// DEALT with it. It may not edit the message, the sender's name, or their
// address — rewriting what somebody said is not triage, and an inbox whose
// contents can be edited is worthless as evidence of what was actually
// reported.
//
// So the only mutation in this module writes `status` / `handled_by` /
// `handled_at` / `handled_note`. The submission's own columns are never in an
// update payload — checkable by reading the two `data:` blocks below.
//
// The insert side belongs to the marketing site (workstream 3). This module
// deliberately exposes no create function: the back office is not a place from
// which a contact submission should be able to appear.
// ===========================================================================

const PAGE_MAX = 100;

export type ContactFilters = {
  q?: string;
  status?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: string;
  limit?: string;
};

const STATUSES: ContactSubmissionStatus[] = ["new", "handled", "spam"];

function asStatus(v: string | undefined): ContactSubmissionStatus | undefined {
  return v && (STATUSES as string[]).includes(v) ? (v as ContactSubmissionStatus) : undefined;
}

export function listContactSubmissions(filters: ContactFilters) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(PAGE_MAX, Math.max(1, parseInt(filters.limit ?? "25", 10) || 25));

  return platformDb(async (tx) => {
    const where: Prisma.ContactSubmissionWhereInput = {};

    const status = asStatus(filters.status);
    if (status) where.status = status;
    if (filters.source?.trim()) where.source = filters.source.trim();

    const q = filters.q?.trim();
    if (q) {
      // NARROW ONLY — half the two-stage match, deliberately. `contains` with
      // `mode: "insensitive"` is ILIKE, which folds ASCII case and nothing
      // else, so «احمد» matched none of the rows stored «أحمد» and this list
      // came back empty about people it holds. `literalFragments` asks only for
      // the pieces that can be compared byte-wise, which fixes that. The JS
      // decide pass is NOT applied because this query is offset-paginated with
      // a `count`, and filtering after the page is cut gives a short page and a
      // wrong total — so the result is a SUPERSET: «احمد» also lists «محمد».
      // This one is written IN Arabic by the public — a name, a subject and a
      // free-text message straight off the marketing site — so it was the list
      // in this app most certain to be searched in the script it cannot match.
      where.AND = exactQuery(q, (t) => ({ searchText: { contains: t } }));
    }

    if (filters.from || filters.to) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (filters.from) createdAt.gte = new Date(filters.from);
      if (filters.to) createdAt.lte = new Date(filters.to);
      where.createdAt = createdAt;
    }

    const [rows, total, newCount] = await Promise.all([
      tx.contactSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.contactSubmission.count({ where }),
      // Unfiltered, so the badge on the nav item means "waiting", not
      // "waiting among whatever is currently filtered".
      tx.contactSubmission.count({ where: { status: "new" } }),
    ]);

    const handlerIds = [...new Set(rows.map((r) => r.handledBy).filter(Boolean) as string[])];
    const handlers = handlerIds.length
      ? await tx.user.findMany({
          where: { id: { in: handlerIds } },
          select: { id: true, name: true },
        })
      : [];
    const handlerById = new Map(handlers.map((h) => [h.id, h.name]));

    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        subject: r.subject,
        message: r.message,
        locale: r.locale,
        source: r.source,
        userId: r.userId,
        status: r.status,
        handledBy: r.handledBy,
        handledByName: r.handledBy ? (handlerById.get(r.handledBy) ?? null) : null,
        handledAt: r.handledAt,
        handledNote: r.handledNote,
        createdAt: r.createdAt,
      })),
      total,
      newCount,
      page,
      limit,
    };
  });
}

/**
 * Triage. The ONLY write this module performs, and it touches four columns —
 * none of which is part of what the sender wrote.
 *
 * Audited, because "who decided this was spam" is a question that gets asked
 * when a real complaint goes missing.
 */
export function setContactSubmissionStatus(
  actor: SessionUser,
  id: string,
  status: ContactSubmissionStatus,
  note?: string,
) {
  return platformDb(async (tx) => {
    const before = await tx.contactSubmission.findUnique({ where: { id } });
    if (!before) throw new NotFoundError("Contact submission not found");

    const handled = status !== "new";
    const updated = await tx.contactSubmission.update({
      where: { id },
      data: {
        status,
        handledBy: handled ? actor.id : null,
        handledAt: handled ? new Date() : null,
        handledNote: note?.trim() || null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        action: "contact_submission.triaged",
        targetType: "contact_submission",
        targetId: id,
        beforeState: { status: before.status } as never,
        afterState: { status, note: note?.trim() || null } as never,
        onBehalfOf: null,
      },
    });

    return updated;
  });
}
