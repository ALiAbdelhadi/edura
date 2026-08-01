import { requireRole } from "@/lib/authz/require-role";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { listUsers } from "@/lib/services/admin/admin-users";
import type { Role } from "@repo/database";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req) => {
  await requireRole("super_admin");
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
