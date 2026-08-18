import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { confirmGuardianEmail } from "@repo/server-core/services/invites/guardian-verification";

export const dynamic = "force-dynamic";

/**
 * Confirm a guardian address from a clicked link. PUBLIC by necessity.
 *
 * The caller is a guardian with no account, so there is nobody to authenticate
 * — the single-use token IS the credential. What makes that safe is how little
 * success grants: the handler marks one address confirmed and returns a masked
 * hint. No session, no cookie, no user, nothing readable about the student.
 *
 * Rate-limited because an unauthenticated door that checks a secret is a door
 * worth guessing at, and every failure returns the SAME message so a prober
 * cannot tell an expired token from a fictional one.
 */
const bodySchema = z.object({ token: z.string().min(1).max(512) }).strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { token } = await parseJson(req, bodySchema);
    return ok(await confirmGuardianEmail(token));
  }),
  10,
  60,
);
