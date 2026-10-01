import { delegated } from "@repo/server-core/authz/teacher-actor";
import { ok } from "@repo/server-core/http/envelope";
import { listMyAffiliations } from "@repo/server-core/services/teacher/affiliations";

export const GET = delegated(async (_req, _ctx, { acting: user }) => {
  const result = await listMyAffiliations(user);
  return ok(result);
});
