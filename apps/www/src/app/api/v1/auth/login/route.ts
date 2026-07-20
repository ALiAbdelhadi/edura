import { z } from "zod";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { withErrors } from "@/lib/errors/http";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { ok } from "@/lib/http/envelope";
import { AuthError } from "@/lib/errors/classes";
import { platformDb } from "@/lib/db/scope";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// Same allowlist as lib/auth/options.ts — back-office staff (super_admin,
// accountant) sign in to apps/superadmin only.
const WWW_ROLES = new Set([
  "center_admin",
  "teacher",
  "parent",
  "student",
  "assistant",
]);

const DUMMY_HASH = "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

function cookieName(): string {
  const isSecure = process.env.NEXTAUTH_URL?.startsWith("https://");
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { email, password } = await parseJson(req, bodySchema);

    const user = await platformDb((tx) => tx.user.findFirst({ where: { email } }));
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const pwMatches = await bcrypt.compare(password, hashToCheck);
    if (
      !user ||
      !WWW_ROLES.has(user.role) ||
      user.status !== "active" ||
      !user.passwordHash ||
      !pwMatches
    ) {
      throw new AuthError("Invalid email or password");
    }

    let centerId: string | undefined;
    if (user.role === "center_admin") {
      const profile = await platformDb((tx) =>
        tx.centerAdminProfile.findFirst({
          where: { userId: user.id },
          select: { centerId: true },
        }),
      );
      centerId = profile?.centerId ?? undefined;
    }

    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error("NEXTAUTH_SECRET is not configured");

    const token = await encode({
      secret,
      token: {
        uid: user.id,
        role: user.role,
        centerId,
        locale: user.locale,
        name: user.name,
        email: user.email,
        ver: user.tokenVersion, // L1: session epoch, revalidated per request
      },
      maxAge: SESSION_MAX_AGE,
    });

    const res = ok({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name,
        locale: user.locale,
        centerId,
      },
    });

    const name = cookieName();
    const isSecure = name.startsWith("__Secure-");
    const e2e = process.env.E2E === "1";
    res.cookies.set({
      name,
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecure,
      path: "/",
      maxAge: e2e ? 0 : SESSION_MAX_AGE,
    });

    return res;
  }),
  10,
  30,
);
