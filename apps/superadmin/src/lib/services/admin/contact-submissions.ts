import type { ContactSubmissionStatus, Prisma } from "@repo/database";
import { exactQuery } from "@repo/database/search-text";
import type { SessionUser } from "@/lib/auth/session";
import { platformDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { parsePageLimit } from "@/lib/validation/common";

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
  const { page, limit } = parsePageLimit(filters, 25);

  return platformDb(async (tx) => {
    const where: Prisma.ContactSubmissionWhereInput = {};

    const status = asStatus(filters.status);
    if (status) where.status = status;
    if (filters.source?.trim()) where.source = filters.source.trim();

    const q = filters.q?.trim();
    if (q) {
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
