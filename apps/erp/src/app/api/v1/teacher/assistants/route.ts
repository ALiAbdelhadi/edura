import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import {
  createAssistant,
  listAssistants,
} from "@/lib/services/teacher/assistants";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("teacher");
  return ok(await listAssistants(user));
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email(),
  title: z.string().trim().max(120).optional(),
  locale: z.enum(["ar", "en"]).optional(),
});

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const data = await parseJson(req, createSchema);
  const result = await createAssistant(user, data);
  return ok(
    {
      id: result.link.id,
      assistantId: result.user.id,
      title: result.link.title,
      existingAccount: result.existingAccount,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        status: result.user.status,
      },
      invite: result.invite
        ? {
            delivery: result.invite.email.status,
            claimLink: result.invite.claimLink,
            expiresAt: result.invite.expiresAt,
          }
        : null,
    },
    { status: 201 },
  );
});
