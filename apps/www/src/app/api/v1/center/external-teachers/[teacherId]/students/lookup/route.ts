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

/**
 * "Do we already know this child?" — run before every manual registration.
 *
 * POST rather than GET because the identifiers are personal data and must not
 * end up in a URL, a server log or a browser history.
 *
 * The disclosure is tiered inside the service: a student already on this
 * center's roster comes back in full (the center holds that data already), and
 * one who exists elsewhere comes back MASKED with no id — enough for a human to
 * say "yes, that's him", not enough to build a directory out of.
 */
export const POST = centerStaff(
  async (req, _ctx, { acting }) => {
    const body = await parseJson(req, lookupSchema);
    return ok(await lookupStudentForManualEntry(acting, body));
  },
  { allow: RECEPTION },
);
