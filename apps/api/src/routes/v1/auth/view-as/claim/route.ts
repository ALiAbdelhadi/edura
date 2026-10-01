import { erpAuth } from "@repo/server-core/erp-auth/instance";
import { APIError } from "@repo/server-core/erp-auth/plugin-api";
import { erpPublicOrigin } from "@repo/server-core/erp-auth/public-origin";
import { viewAsRedirect } from "@repo/server-core/erp-auth/view-as";

export async function POST(req: Request): Promise<Response> {
  const form = await req.formData().catch(() => null);
  const token = typeof form?.get("token") === "string" ? String(form.get("token")) : "";

  const fail = () => viewAsRedirect(new URL("/login", erpPublicOrigin()));
  if (!token) return fail();

  let result: {
    headers: Headers;
    response: { user?: { locale?: string } };
  };
  try {
    const { headers, response } = await erpAuth().api.claimViewAs({
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
  const res = viewAsRedirect(new URL(`/${locale}/dashboard`, erpPublicOrigin()));
  for (const cookie of result.headers.getSetCookie()) {
    res.headers.append("set-cookie", cookie);
  }
  return res;
}
