import { platformDb } from "@/lib/db/scope";
import { narrowQuery } from "@repo/database/search-text";
import { NotFoundError } from "@/lib/errors/classes";
import { parsePageLimit } from "@/lib/validation/common";

// What the list renders, and nothing else. `params` carries the child's name and
// student code and `providerResponse` the provider's payload; both belong to the one
// row an operator opens, not to every row they scroll past.
const LIST_FIELDS = {
  id: true,
  recipientPhone: true,
  template: true,
  locale: true,
  status: true,
  provider: true,
  providerMessageId: true,
  createdAt: true,
} as const;

export function listWhatsAppMessages(filters: {
  q?: string;
  status?: string;
  template?: string;
  page?: string;
  limit?: string;
}) {
  const { page, limit } = parsePageLimit(filters, 20);
  return platformDb(async (tx) => {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.template) where.template = filters.template;
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      where.AND = narrowQuery(q, (f) => [
        { recipientPhone: { contains: f } },
        { template: { contains: f, mode: "insensitive" as const } },
        { providerMessageId: { contains: f } },
      ]);
    }
    const [rows, total] = await Promise.all([
      tx.whatsAppMessage.findMany({
        where,
        select: LIST_FIELDS,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.whatsAppMessage.count({ where }),
    ]);
    return { data: rows, total, page, limit };
  });
}

export function getWhatsAppMessage(id: string) {
  return platformDb(async (tx) => {
    const row = await tx.whatsAppMessage.findUnique({
      where: { id },
      select: {
        ...LIST_FIELDS,
        params: true,
        providerResponse: true,
        error: true,
        userId: true,
        centerId: true,
      },
    });
    if (!row) throw new NotFoundError("Message not found");
    return row;
  });
}
