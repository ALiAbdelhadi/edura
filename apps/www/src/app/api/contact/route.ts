import { NextResponse } from "next/server";

import { appOrigin } from "@/lib/app-origin";

export const dynamic = "force-dynamic";

const SUBJECTS = ["demo", "pricing", "support", "partnership", "other"] as const;
const LOCALES = ["ar", "en"] as const;

type Body = {
  name: string;
  email: string;
  phone: string;
  subject: (typeof SUBJECTS)[number];
  message: string;
  locale: (typeof LOCALES)[number];
};

const FIELDS = new Set(["name", "email", "phone", "subject", "message", "locale"]);

function parseBody(raw: unknown): Body | null {
  if (typeof raw !== "object" || raw === null) return null;
  const value = raw as Record<string, unknown>;

  if (Object.keys(value).some((key) => !FIELDS.has(key))) return null;

  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string).trim() : null);

  const name = text("name");
  const email = text("email")?.toLowerCase() ?? null;
  const phone = text("phone") ?? "";
  const subject = text("subject");
  const message = text("message");
  const locale = text("locale");

  if (!name || name.length < 2 || name.length > 120) return null;
  if (!email || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (phone.length > 40) return null;
  if (!subject || !(SUBJECTS as readonly string[]).includes(subject)) return null;
  if (!message || message.length < 10 || message.length > 4000) return null;
  if (!locale || !(LOCALES as readonly string[]).includes(locale)) return null;

  return {
    name,
    email,
    phone,
    subject: subject as Body["subject"],
    message,
    locale: locale as Body["locale"],
  };
}

export async function POST(request: Request) {
  let parsed: Body | null = null;
  try {
    parsed = parseBody(await request.json());
  } catch {
    parsed = null;
  }

  if (!parsed) {
    return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for");

  let response: Response;
  try {
    response = await fetch(`${appOrigin()}/api/v1/contact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(forwarded ? { "x-forwarded-for": forwarded } : {}),
        ...(request.headers.get("user-agent")
          ? { "user-agent": request.headers.get("user-agent")! }
          : {}),
      },
      body: JSON.stringify(parsed),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "UNREACHABLE" }, { status: 502 });
  }

  if (response.status === 429) {
    return NextResponse.json({ ok: false, error: "RATE_LIMITED" }, { status: 429 });
  }
  if (!response.ok) {
    return NextResponse.json({ ok: false, error: "FAILED" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
