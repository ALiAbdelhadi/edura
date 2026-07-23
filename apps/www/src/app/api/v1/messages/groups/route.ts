import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { createGroup, listGroups } from "@/lib/services/messages/messages";

export const dynamic = "force-dynamic";

// Group channels the caller belongs to. Membership is DERIVED from real
// relationships (enrollments / teams / rosters) in @repo/database/chat-groups;
// the cached membership row only gets a group into this list, and the live
// gate re-checks on open — so a stale row never grants access.
export const GET = withErrors(async () => {
  const user = await requireSession();
  return ok(await listGroups(user));
});

const createSchema = z
  .object({
    kind: z.enum(["course", "session", "center_announcement"]),
    courseId: z.uuid().optional(),
    sessionId: z.uuid().optional(),
    centerId: z.uuid().optional(),
    title: z.string().min(1).max(200).optional(),
    postPolicy: z.enum(["owner_only", "members"]).optional(),
  })
  .refine(
    (d) =>
      (d.kind === "course" && d.courseId) ||
      (d.kind === "session" && d.sessionId) ||
      (d.kind === "center_announcement" && d.centerId),
    { message: "The source relation for this kind is required" },
  );

// Creation rights (teacher of the course / their active assistant / the
// center's admin or manager staff) are enforced in the domain layer against the
// SAME derivation the read gate uses — never re-implemented here.
export const POST = withErrors(async (req) => {
  const user = await requireSession();
  const data = await parseJson(req, createSchema);
  return ok(await createGroup(user, data), { status: 201 });
});
