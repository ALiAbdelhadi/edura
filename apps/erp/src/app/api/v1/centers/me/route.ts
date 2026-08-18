import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireRole("center_admin");
  const center = await scopedDb(user, (tx) =>
    tx.center.findUnique({ where: { id: user.centerId as string } }),
  );
  if (!center) throw new NotFoundError("Center not found");
  return ok(center);
});

const patchSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email().optional(),
  // Where the center IS. These were written once by the onboarding wizard and
  // then had no writer at all, so a center that moved — or mis-picked a
  // district on day one — had no way to correct it. Bounds match the wizard's
  // own contract (`me/onboarding`): trimmed, capped, nullable. They stay free
  // strings rather than an enum for the same reason the wizard does: the
  // governorate/area list is bundled reference data that regenerates, and a
  // stored value must not stop validating because the dataset moved under it.
  governorate: z.string().trim().max(100).nullish(),
  area: z.string().trim().max(100).nullish(),
  // `logoUrl` is DELIBERATELY absent — the logo is set only by uploading to
  // `POST /centers/me/logo`. Accepting a free-text URL here let a center point
  // its own row at another entity's (publicly visible) Cloudinary URL, after
  // which the replace-cleanup destroyed an asset the center never owned. The
  // schema is the fix; the `owned` guard in the media kernel is the backstop.
  location: z
    .object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    })
    .optional(),
});

export const PATCH = withErrors(async (req) => {
  const user = await requireRole("center_admin");
  const body = await parseJson(req, patchSchema);

  const { location, ...rest } = body;
  const data = location
    ? { ...rest, lng: location.coordinates[0], lat: location.coordinates[1] }
    : rest;

  // No image cleanup runs here any more: this route can no longer touch
  // `logo_url` at all, so the only writer is the upload service, which owns
  // its own replace-and-clean pass.
  const center = await scopedDb(user, async (tx) => {
    try {
      return await tx.center.update({ where: { id: user.centerId as string }, data });
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2025") {
        throw new NotFoundError("Center not found");
      }
      throw err;
    }
  });
  return ok(center);
});
