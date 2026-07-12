import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { SUBJECTS } from "@/lib/constants/subjects";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  return ok(SUBJECTS);
});
