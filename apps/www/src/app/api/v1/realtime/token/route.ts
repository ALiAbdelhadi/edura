import { SignJWT } from "jose";
import { withErrors } from "@/lib/errors/http";
import { requireSession } from "@/lib/auth/session";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

// Mints the short-lived JWT the browser presents in the Socket.IO handshake.
// The realtime server runs as a separate long-lived process (serverless can't
// hold sockets), so this token is how the NextAuth session extends to it —
// without sharing cookies across deployments. 60s TTL: it authenticates the
// handshake only; the socket session itself lives as long as the connection.
export const GET = withErrors(async () => {
  const user = await requireSession();
  const secret =
    process.env.REALTIME_JWT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("REALTIME_JWT_SECRET / NEXTAUTH_SECRET is not configured");
  }

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
