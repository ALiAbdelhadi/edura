import { platformDb } from "../../db/scope";

export type SitemapHandle = { handle: string; updatedAt: Date };

// Public tenant pages: only handles whose owner passes the same status gate
// the page itself applies, so the sitemap never advertises a 404.
export function listSitemapHandles(): Promise<SitemapHandle[]> {
  return platformDb((tx) =>
    tx.publicHandle.findMany({
      where: {
        OR: [
          { kind: "center", center: { status: "active" } },
          { kind: "teacher", teacherProfile: { user: { status: "active", role: "teacher" } } },
        ],
      },
      select: { handle: true, updatedAt: true },
      orderBy: { handle: "asc" },
      take: 5000,
    }),
  );
}
