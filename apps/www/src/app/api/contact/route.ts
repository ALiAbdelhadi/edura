import { NextResponse } from "next/server";

import { appOrigin } from "@/lib/app-origin";

/**
 * The contact form's door on THIS origin — and it is a proxy, not a second
 * implementation.
 *
 * `apps/erp` already owns contact: `POST /api/v1/contact` validates, rate
 * limits, writes `contact_submissions`, and the super-admin inbox reads that
 * one table. A form here that wrote its own row would give the business two
 * inboxes and guarantee that one of them stops being read.
 *
 * WHY PROXY RATHER THAN POST STRAIGHT TO THE APP:
 *  - this site's CSP is `connect-src 'self'`, and loosening it to allow a
 *    second origin would weaken the whole marketing surface for one form;
 *  - the app's endpoint would need CORS for this origin, which is a change to
 *    a different app's public security posture for our convenience.
 * A server-to-server call is subject to neither.
 *
 * THE SHAPE IS DUPLICATED ON PURPOSE, and only the shape. It mirrors the
 * app's `.strict()` schema exactly so a malformed request is refused here and
 * never leaves this origin. The app re-validates regardless — this is a
 * filter, not a substitute for its check.
 *
 * Hand-checked rather than with zod: this site carries no validation library
 * and six bounded fields are less code than the import would be. The app,
 * which has zod already, remains the authority.
 */
export const dynamic = "force-dynamic";

// NOT exported: a route handler may only export the HTTP verbs and Next's own
// config names, and an extra export fails the build's route type check.
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

  // `.strict()`: an unexpected field is a refusal, not a silently dropped
  // value — the same posture the app's schema takes.
  if (Object.keys(value).some((key) => !FIELDS.has(key))) return null;

  const text = (key: string) => (typeof value[key] === "string" ? (value[key] as string).trim() : null);

  const name = text("name");
  const email = text("email")?.toLowerCase() ?? null;
  const phone = text("phone") ?? "";
  const subject = text("subject");
  const message = text("message");
  const locale = text("locale");

  if (!name || name.length < 2 || name.length > 120) return null;
  // Deliberately loose: an address is proven by delivering to it, never by a
  // regex, and a strict pattern here would reject valid addresses while
  // stopping no abuse the rate limit does not already stop.
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
    // No field-level detail back to an unauthenticated caller: the form
    // already validates in the browser, so a 400 here means a script, and a
    // script does not deserve a map of the schema.
    return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });
  }

  /* Carry the VISITOR's address forward, not this server's.
     Without it the app sees one IP for every submission on earth and its
     per-IP limiter becomes a global one — the first abuser exhausts the
     bucket for every real person.
     NOTE for whoever configures the app: this adds a proxy hop, so the app's
     `TRUSTED_PROXY_HOPS` has to account for it before the limit is genuinely
     per-visitor again. Until then the app's limit is per-www-instance and the
     real per-visitor guard is the app's own validation plus the form's. */
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
      // A visitor is waiting on this. If the app is slow, fail in a way the
      // form can tell them about rather than hanging until the platform's own
      // function timeout kills it with no message.
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

  // Receipt only. The app's endpoint deliberately echoes no id and no row;
  // relaying anything more would undo that.
  return NextResponse.json({ ok: true });
}
