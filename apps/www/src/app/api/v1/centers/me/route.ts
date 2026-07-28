import { z } from "zod";
import { withErrors } from "@/lib/errors/http";
import { requireRole } from "@/lib/authz/require-role";
import { scopedDb } from "@/lib/db/scope";
import { NotFoundError } from "@/lib/errors/classes";
import { ok } from "@/lib/http/envelope";
import { parseJson } from "@/lib/validation/zod";
import { deleteReplacedImage } from "@repo/server-core/media/images";

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
  logoUrl: z.string().url().optional(),
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

  // Pasting a new logo URL here replaces an uploaded one, and the upload path
  // is the only place that used to clean up after itself — so without this the
  // old Cloudinary asset was stranded in the account with nothing pointing at
  // it. Only read the previous value when the field is actually being edited.
  let previousLogoUrl: string | null = null;
  const center = await scopedDb(user, async (tx) => {
    if (body.logoUrl !== undefined) {
      const existing = await tx.center.findUnique({
        where: { id: user.centerId as string },
        select: { logoUrl: true },
      });
      previousLogoUrl = existing?.logoUrl ?? null;
    }
    try {
      return await tx.center.update({ where: { id: user.centerId as string }, data });
    } catch (err) {
      if (err && typeof err === "object" && (err as { code?: string }).code === "P2025") {
        throw new NotFoundError("Center not found");
      }
      throw err;
    }
  });
  // After the commit, and never fatal: a Cloudinary hiccup must not fail an
  // edit the user already saw succeed.
  if (body.logoUrl !== undefined) await deleteReplacedImage(previousLogoUrl, center.logoUrl);
  return ok(center);
});
