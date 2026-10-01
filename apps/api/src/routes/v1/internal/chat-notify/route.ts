import { requireDedicatedSecret } from "@repo/server-core/config/secrets";
import { ForbiddenError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { notifyChatMessage } from "@repo/server-core/services/messages/chat-notify";
import { parseJson } from "@repo/server-core/validation/zod";
import { secretEquals } from "@repo/server-core/auth/secret-compare";
import { z } from "zod";

const schema = z.object({
  conversationId: z.uuid(),
  messageId: z.uuid(),
});

export const POST = withErrors(async (req) => {
  const secret = requireDedicatedSecret("INTERNAL_API_SECRET");
  if (!secretEquals(req.headers.get("x-internal-secret"), secret)) {
    throw new ForbiddenError("Invalid internal secret");
  }

  const data = await parseJson(req, schema);
  return ok(await notifyChatMessage(data));
});
