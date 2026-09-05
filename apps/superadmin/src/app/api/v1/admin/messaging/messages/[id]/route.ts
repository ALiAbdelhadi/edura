import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { removeMessage } from "@/lib/services/admin/messaging";

export const dynamic = "force-dynamic";

export const DELETE = withRole("super_admin", async (admin, req, ctx) => {
  const { id } = await ctx.params;
  const { scope } = await parseJson(
    req,
    z.object({ scope: z.enum(["direct", "group"]).default("direct") }),
  );
  return ok(await removeMessage(admin.id, id ?? "", scope));
});
