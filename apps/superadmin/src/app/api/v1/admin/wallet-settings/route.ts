import { z } from "zod";
import { withRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getWalletPolicy,
  updateWalletPolicy,
} from "@/lib/services/settings/wallet-settings-admin";

export const dynamic = "force-dynamic";

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
