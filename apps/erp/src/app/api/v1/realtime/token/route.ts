import { SignJWT } from "jose";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { requireDedicatedSecret } from "@/lib/config/secrets";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => {
  const user = await requireSession();
  const secret = requireDedicatedSecret("REALTIME_JWT_SECRET");

  const token = await new SignJWT({
    role: user.role,
    centerId: user.centerId ?? null,
    name: user.name ?? "",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setAudience("edura-realtime")
    .setIssuer("edura")
    .setIssuedAt()
    .setExpirationTime("60s")
    .sign(new TextEncoder().encode(secret));

  return ok({
    token,
    url: process.env.NEXT_PUBLIC_REALTIME_URL ?? "http://localhost:3005",
  });
});
