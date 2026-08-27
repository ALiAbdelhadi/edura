import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { initiatePayment } from "@/lib/services/payments/payment-intents";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    courseId: z.string().uuid(),
    method: z.enum(["card", "wallet"]),
    idempotencyKey: z.string().min(8).max(128),
  })
  .strict();

export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("student");
    const body = await parseJson(req, bodySchema);
    return ok(await initiatePayment(body, user), { status: 201 });
  }),
  30,
  30,
);
