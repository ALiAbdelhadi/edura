import { auth } from "@/lib/auth/auth";
import { platformDb } from "@/lib/db/scope";
import { AuthError } from "@/lib/errors/classes";
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { withRateLimit } from "@/lib/rate-limit/middleware";
import { parseJson } from "@/lib/validation/zod";
import { APIError } from "better-auth/api";
import { z } from "zod";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

// C-04: this door no longer holds ANY policy of its own — it forwards to the
// same better-auth instance the browser login uses, so the role partition
// (canSignIn), C2 rate limits, H5 timing and the credential verify are the
// SINGLE implementation in lib/auth/auth.ts. The old drift bug (this door
// missing center_staff while NextAuth allowed it) is structurally impossible.
export const POST = withRateLimit(
  withErrors(async (req) => {
    const { email, password } = await parseJson(req, bodySchema);

    let result: { headers: Headers; response: { token: string | null; user: unknown } };
    try {
      result = await auth.api.signInEmail({
        body: { email, password },
        headers: req.headers,
        returnHeaders: true,
      });
    } catch (e) {
      if (e instanceof APIError) {
        // Generic message on purpose — this REST door predates the typed www
        // UX and its callers (E2E, tooling) only branch on 401 vs 200.
        throw new AuthError("Invalid email or password");
      }
      throw e;
    }

    const sessionUser = result.response.user as {
      id: string;
      email: string | null;
      name: string | null;
      role: string;
      locale: "ar" | "en";
    };

    // The session-create hook stored the centerId claim on the session row.
    const centerId = result.response.token
      ? ((
          await platformDb((tx) =>
            tx.authSession.findUnique({
              where: { token: result.response.token as string },
              select: { centerId: true },
            }),
          )
        )?.centerId ?? undefined)
      : undefined;

    const res = ok({
      token: result.response.token,
      user: {
        id: sessionUser.id,
        email: sessionUser.email,
        role: sessionUser.role,
        name: sessionUser.name,
        locale: sessionUser.locale,
        centerId,
      },
    });

    // Forward better-auth's Set-Cookie headers onto the envelope response.
    // E2E=1 keeps the old behaviour: session-scoped cookie (dropped when the
    // browser context closes) instead of the 30-day Max-Age.
    const e2e = process.env.E2E === "1";
    for (const cookie of result.headers.getSetCookie()) {
      res.headers.append(
        "set-cookie",
        e2e ? cookie.replace(/;\s*Max-Age=\d+/i, "") : cookie,
      );
    }

    return res;
  }),
  10,
  30,
);
