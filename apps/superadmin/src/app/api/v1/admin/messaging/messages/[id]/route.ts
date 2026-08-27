import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { removeMessage } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

export const DELETE = withErrors(
  async (req: Request, ctx: { params: Promise<Record<string, string>> }) => {
    const admin = await requireRole("super_admin");
    const { id } = await ctx.params;
    const { scope } = await parseJson(
      req,
      z.object({ scope: z.enum(["direct", "group"]).default("direct") }),
    );
    return ok(await removeMessage(admin.id, id ?? "", scope));
  },
);
