import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scope";
import { ConflictError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required"),
});

export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const { reason } = await parseJson(req, createSchema);

  const request = await scopedDb(user, async (tx) => {
    const existing = await tx.deletionRequest.findFirst({
      where: {
        userId: user.id,
        status: "pending",
      },
    });
    if (existing) {
      throw new ConflictError("You already have a pending deletion request");
    }

    return tx.deletionRequest.create({
      data: {
        userId: user.id,
        reason,
        centerId: user.centerId ?? null,
      },
    });
  });

  return ok(request, { status: 201 });
});
