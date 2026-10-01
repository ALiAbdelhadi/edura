import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { listActiveSubjects } from "@repo/server-core/services/catalog/subjects";

export const GET = withErrors(async () => {
  const subjects = await listActiveSubjects();
  return ok(subjects);
});
