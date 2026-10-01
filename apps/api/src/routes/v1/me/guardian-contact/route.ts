import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import {
  getGuardianContactStatus,
  setGuardianContact,
} from "@repo/server-core/services/invites/guardian-contact";
import { resolveGuardianContactTarget } from "@repo/server-core/services/invites/guardian-contact-target";

const bodySchema = z
  .object({
    guardianEmail: z.string().trim().toLowerCase().email().optional(),
    guardianPhone: z.string().trim().min(6).max(20).optional(),
    studentId: z.string().uuid().optional(),
  })
  .strict();

export const GET = withErrors(async (req) => {
  const session = await requireSession();
  const studentId = new URL(req.url).searchParams.get("studentId") ?? undefined;
  const target = await resolveGuardianContactTarget(session, studentId);
  return ok(await getGuardianContactStatus(target));
});

export const POST = withRateLimit(
  withErrors(async (req) => {
    const session = await requireSession();
    const body = await parseJson(req, bodySchema);
    const target = await resolveGuardianContactTarget(session, body.studentId);
    return ok(await setGuardianContact(session, target, body));
  }),
  10,
  10,
);
