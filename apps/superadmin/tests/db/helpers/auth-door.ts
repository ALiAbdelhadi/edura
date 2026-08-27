import { auth } from "@/lib/auth/auth";
import { APIError } from "better-auth/api";

let ipCounter = 0;

export function freshIp(): string {
  ipCounter += 1;
  return `198.51.${Math.floor(ipCounter / 250)}.${(ipCounter % 250) + 1}`;
}

export type DoorResult =
  | { ok: true; token: string; cookie: string; user: Record<string, unknown> }
  | { ok: false; status: number; message: string };

function cookieFromHeaders(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
}

export async function signInDoor(
  email: string,
  password: string,
  opts: { ip?: string } = {},
): Promise<DoorResult> {
  try {
    const { headers, response } = await auth.api.signInEmail({
      body: { email, password },
      headers: new Headers({
        "x-forwarded-for": opts.ip ?? freshIp(),
        "user-agent": "db-proof-suite",
      }),
      returnHeaders: true,
    });
    return {
      ok: true,
      token: response.token ?? "",
      cookie: cookieFromHeaders(headers),
      user: response.user as unknown as Record<string, unknown>,
    };
  } catch (e) {
    if (e instanceof APIError) {
      return {
        ok: false,
        status: e.statusCode,
        message: (e.body as { message?: string } | undefined)?.message ?? "",
      };
    }
    throw e;
  }
}

export async function sessionFor(cookie: string): Promise<{
  userId: string;
  role: string;
  locale?: string;
} | null> {
  const res = await auth.api.getSession({
    headers: new Headers({ cookie }),
  });
  if (!res?.user?.id) return null;
  const u = res.user as { id: string; role?: string; locale?: string };
  return {
    userId: u.id,
    role: (u.role as string) ?? "",
    locale: u.locale,
  };
}
