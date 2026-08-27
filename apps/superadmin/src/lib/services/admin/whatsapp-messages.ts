import { platformDb } from "@/lib/db/scope";
import { narrowQuery } from "@repo/database/search-text";

export function listWhatsAppMessages(filters: {
  q?: string;
  status?: string;
  template?: string;
  page?: string;
  limit?: string;
}) {
  const page = Math.max(1, parseInt(filters.page ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit ?? "20", 10) || 20));
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
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      tx.whatsAppMessage.count({ where }),
    ]);
    return { data: rows, total, page, limit };
  });
}
