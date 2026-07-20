import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    email: z.string().email().toLowerCase().trim().optional(),
    phone: z.string().trim().optional(),
  })
  .refine((d) => d.email || d.phone, { message: "Provide email or phone" });

// L4: this endpoint resolves an account by an exact email/phone the caller
// already holds. We return only two booleans — never the person's id, name, or
// email — so a single probe reveals no PII beyond existence, and rate-limiting
// (20 burst, 20/min per IP) stops it being used to sweep the user base.
export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("center_admin");
    const body = await parseJson(req, bodySchema);

    const filter: { email?: string; phone?: string } = {};
    if (body.email) filter.email = body.email;
    else if (body.phone) filter.phone = body.phone;

    const student = await scopedDb(user, (tx) =>
      tx.user.findFirst({
        where: { ...filter, role: "student", status: { not: "deleted" } },
        select: { status: true },
      }),
    );

    const found = student !== null;
    // An invite/activation can proceed only when no real account exists yet:
    // no match, or an unclaimed shell. A registered student is linked by other
    // flows (the invite route itself rejects non-shell accounts).
    const inviteSendable = !found || student.status === "shell";

    return ok({ found, inviteSendable });
  }),
  20,
  20,
);
