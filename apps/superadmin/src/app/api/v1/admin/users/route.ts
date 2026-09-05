import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { listUsers } from "@/lib/services/admin/admin-users";
import type { Role } from "@repo/database";

export const dynamic = "force-dynamic";

export const GET = withRole("super_admin", async (_user, req) => {
  const url = new URL(req.url);
  const take = Number(url.searchParams.get("take") ?? 25);
  return ok(
    await listUsers({
      q: url.searchParams.get("q") ?? undefined,
      role: (url.searchParams.get("role") as Role | null) ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      take: Number.isFinite(take) ? take : 25,
      cursor: url.searchParams.get("cursor") ?? undefined,
    }),
  );
});
