import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { BusinessRuleError } from "@/lib/errors/classes";
import { syncOfflineAttendance } from "@/lib/services/attendance/sync";

export const dynamic = "force-dynamic";

const recordSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["present", "absent", "late", "excused"]),
  localTimestamp: z.coerce.date().optional(),
});

const bodySchema = z
  .object({
    records: z.array(recordSchema).max(500).optional(),
    offlineRecords: z.array(recordSchema).max(500).optional(),
    offline_records: z.array(recordSchema).max(500).optional(),
  })
  .transform((d) => d.records ?? d.offlineRecords ?? d.offline_records ?? []);

export const POST = withErrors(async (req) => {
  const user = await requireRole("teacher");
  const records = await parseJson(req, bodySchema);
  if (records.length === 0) throw new BusinessRuleError("No offline records provided");
  return ok(await syncOfflineAttendance(records, user));
});
