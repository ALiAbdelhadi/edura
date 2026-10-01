import { z } from "zod";
import { withRole } from "@repo/server-core/backoffice-auth/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getWalletPolicy,
  updateWalletPolicy,
} from "@repo/server-core/backoffice/settings/wallet-settings-admin";

export const GET = withRole("super_admin", async () => {
  return ok(await getWalletPolicy());
});

const putSchema = z
  .object({
    minTopup: z.number().int().min(1),
    maxTopup: z.number().int().min(1),
  })
  .strict();

export const PUT = withRole("super_admin", async (user, req) => {
  const body = await parseJson(req, putSchema);
  return ok(await updateWalletPolicy(body, user));
});
