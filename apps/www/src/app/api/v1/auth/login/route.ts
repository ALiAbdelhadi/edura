import { platformDb } from "@/lib/db/scope";
import { AuthError } from "@/lib/errors/classes";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { canSignIn, resolveLoginCenterId } from "@repo/server-core/auth/login-policy";
import bcrypt from "bcryptjs";
import { encode } from "next-auth/jwt";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

// C-04: this door used to keep its OWN copy of the www allowlist, which had
// drifted from lib/auth/options.ts (center_staff was missing → every Center
// Staff account got 401 with the correct password here while NextAuth let them
// in). Both doors now call canSignIn("www", role) against the single shared
// partition in @repo/server-core/auth/login-policy. No list lives in this file.

// H5: a valid bcrypt hash of a random string. Compared against when the account
// is missing/ineligible so login timing matches a real wrong-password attempt.
const DUMMY_HASH = "$2b$10$wrFkXDBP7l73KSdBAgzutOaGQi9FZfAP/69GAeqzK0AiUDGWqhpsW";

function cookieName(): string {
  const isSecure = process.env.NEXTAUTH_URL?.startsWith("https://");
  return isSecure ? "__Secure-next-auth.session-token" : "next-auth.session-token";
}

export const POST = withRateLimit(
  withErrors(async (req) => {
    const { email, password } = await parseJson(req, bodySchema);

    const user = await platformDb((tx) => tx.user.findFirst({ where: { email } }));

    // H5: bcrypt.compare runs UNCONDITIONALLY — against the real hash when the
    // account is eligible, else DUMMY_HASH — so a nonexistent email and a
    // real-but-wrong password share a timing path (no enumeration oracle).
    // Identical shape to lib/auth/options.ts.
    const eligible =
      !!user && canSignIn("www", user.role) && user.status === "active" && !!user.passwordHash;
    const pwMatches = await bcrypt.compare(
      password,
      eligible ? (user.passwordHash as string) : DUMMY_HASH,
    );
    if (!user || !eligible || !pwMatches) {
      throw new AuthError("Invalid email or password");
    }

    // Same resolver NextAuth uses (center_admin → profile, center_staff → live
    // link). Staff authorization is still re-derived per request by
    // requireCenterActor; this claim is only a convenience.
    const centerId = await resolveLoginCenterId(user.role, user.id);

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
        ver: user.tokenVersion,
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