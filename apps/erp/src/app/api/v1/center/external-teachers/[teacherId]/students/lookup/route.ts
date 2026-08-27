import { z } from "zod";
import { centerStaff, RECEPTION } from "@/lib/authz/center-actor";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { lookupStudentForManualEntry } from "@/lib/services/external-teachers";

export const dynamic = "force-dynamic";

const lookupSchema = z
  .object({
    phone: z.string().trim().min(6).max(20).nullish(),
    nationalId: z.string().trim().min(14).max(20).nullish(),
    studentCode: z.string().trim().min(3).max(40).nullish(),
  })
  .refine((v) => !!(v.phone || v.nationalId || v.studentCode), {
    message: "Provide a phone, a national ID or a student code",
  });

export const POST = centerStaff(
  async (req, _ctx, { acting }) => {
    const body = await parseJson(req, lookupSchema);
    return ok(await lookupStudentForManualEntry(acting, body));
  },
  { allow: RECEPTION },
);
