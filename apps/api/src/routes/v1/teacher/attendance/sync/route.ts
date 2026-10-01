import { z } from "zod";
import { withErrors } from "@repo/server-core/errors/http";
import { requireRole } from "@repo/server-core/authz/require-role";
import { ok } from "@repo/server-core/http/envelope";
import { parseJson } from "@repo/server-core/validation/zod";
import { BusinessRuleError } from "@repo/server-core/errors/classes";
import { syncOfflineAttendance } from "@repo/server-core/services/attendance/sync";

const recordSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "excused"]),
  localTimestamp: z.coerce.date().optional(),
  stage: z.enum(["door"]).optional(),
});

const bodySchema = z
  .object({
    records: z.array(recordSchema).max(500).optional(),
    offlineRecords: z.array(recordSchema).max(500).optional(),
    offline_records: z.array(recordSchema).max(500).optional(),
  })
  .transform((d) => d.records ?? d.offlineRecords ?? d.offline_records ?? []);

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher", "assistant");
  const records = await parseJson(req, bodySchema);
  if (records.length === 0) throw new BusinessRuleError("No offline records provided");
  return ok(await syncOfflineAttendance(records, user));
});
