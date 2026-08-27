import { auth } from "@/lib/auth/auth";
import { APIError } from "better-auth/api";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const token = typeof form?.get("token") === "string" ? String(form.get("token")) : "";

  const fail = () => NextResponse.redirect(new URL("/login", req.url), 303);
  if (!token) return fail();

  let result: {
    headers: Headers;
    response: { user?: { locale?: string } };
  };
  try {
    const { headers, response } = await auth.api.claimViewAs({
      body: { token },
      headers: req.headers,
      returnHeaders: true,
    });
    result = { headers, response: response as { user?: { locale?: string } } };
  } catch (e) {
    if (e instanceof APIError) return fail();
    throw e;
  }

  const locale = result.response.user?.locale === "en" ? "en" : "ar";
  const res = NextResponse.redirect(new URL(`/${locale}/dashboard`, req.url), 303);
  for (const cookie of result.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
