import { platformDb } from "@/lib/db/scope";
import { narrowQuery } from "@repo/database/search-text";

/** Step 7: back-office view over the WhatsApp delivery log. */
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
      // Every column here is ASCII, so the fold that matters is the NUMERALS: a
      // phone number typed on an Arabic keypad («٠١٠…») matched nothing at all.
      // `literalFragments` normalizes it to ASCII and `fragmentVariants` sends
      // both renderings. Narrow-only, for the pagination reason in `platform.ts`.
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
