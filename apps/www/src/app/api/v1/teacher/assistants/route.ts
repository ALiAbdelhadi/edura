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
  password: z.string().min(8).max(128),
  title: z.string().trim().max(120).optional(),
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
    },
    { status: 201 },
  );
});
