import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
});

// L4: this endpoint resolves an account by an exact email the caller already
// holds. We return only two booleans — never the teacher's id, name, or email —
// so a single probe reveals no PII beyond existence, and rate-limiting (20
// burst, 20/min per IP) stops it being used to sweep the user base.
export const POST = withRateLimit(
  withErrors(async (req) => {
    const user = await requireRole("center_admin");
    const { email } = await parseJson(req, bodySchema);

    const teacher = await scopedDb(user, (tx) =>
      tx.user.findFirst({
        where: { email, role: "teacher", status: { not: "deleted" } },
        select: { status: true },
      }),
    );

    const found = teacher !== null;
    // An invite/activation can proceed only when no real account exists yet:
    // no match, or an unclaimed shell. A registered teacher is added via a
    // collaboration request instead (the invite route rejects non-shell
    // accounts with exactly that guidance).
    const inviteSendable = !found || teacher.status === "shell";

    return ok({ found, inviteSendable });
  }),
  20,
  20,
);
