import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  getWalletPolicy,
  updateWalletPolicy,
} from "@/lib/services/settings/wallet-settings-admin";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  await requireRole("super_admin");
  return ok(await getWalletPolicy());
});

const putSchema = z
  .object({
    minTopup: z.number().int().min(1),
    maxTopup: z.number().int().min(1),
  })
  .strict();

export const PUT = withErrors(async (req) => {
  const user = await requireRole("super_admin");
  const body = await parseJson(req, putSchema);
  return ok(await updateWalletPolicy(body, user));
});
