import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { removeMessage } from "@repo/server-core/backoffice/admin/messaging";

export const DELETE = withRole("super_admin", async (admin, req, ctx) => {
  const { id } = await ctx.params;
  const { scope } = await parseJson(
    req,
    z.object({ scope: z.enum(["direct", "group"]).default("direct") }),
  );
  return ok(await removeMessage(admin.id, id ?? "", scope));
});
