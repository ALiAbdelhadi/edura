import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_ROOT = path.resolve(__dirname, "../../src/app/api");

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectRouteFiles(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

function routeKey(file: string): string {
  return path.relative(API_ROOT, path.dirname(file)).split(path.sep).join("/");
}

const AUTH_TOKENS = [
  "requireRole(",
  "requireSession(",
  "getSessionUser(",
  "centerStaff(",
  "delegated(",
  "delegatedWithCenter(",
  "requireCenterScope(",
  "requireCenterActor(",
  "resolveActingTeacher(",
];

type PublicEntry = {
  reason: string;
  mustContain?: string[];
  getOnly?: boolean;
};

const PUBLIC_ROUTES: Record<string, PublicEntry> = {
  "auth/[...all]": {
    reason: "better-auth catch-all; auth IS the handler",
    mustContain: ["toNextJsHandler(auth)"],
  },
  health: {
    reason: "infra health check — status code is the signal, DB-only probe",
    getOnly: true,
  },
  "v1/%5Fping": {
    reason: "infra liveness ping (pre-dates /api/health; returns 200 always)",
    getOnly: true,
  },
  "v1/auth/invite/accept": {
    reason: "invite claim door — the single-use token is the credential",
    mustContain: ["withRateLimit", "parseJson"],
  },
  "v1/auth/password/forgot": {
    reason: "public reset request; enumeration-safe generic response",
    mustContain: ["withRateLimit"],
  },
  "v1/auth/password/reset": {
    reason: "public reset completion — the emailed token is the credential",
    mustContain: ["withRateLimit"],
  },
  "v1/me/email/confirm": {
    reason: "M-06: login-email change confirmation — the token mailed to the NEW address is the credential; the switch revokes every session",
    mustContain: ["withRateLimit"],
  },
  "v1/auth/view-as/claim": {
    reason:
      "the landing door for a back-office 'view as'. apps/superadmin POSTs the " +
      "signed handoff token here as a TOP-LEVEL FORM NAVIGATION, so the caller " +
      "holds no ERP session yet and there is nothing for an auth wrapper to " +
      "check — the token SIGNATURE is the credential, verified by " +
      "auth.api.claimViewAs. Safe because that token is single-target, " +
      "60-second, and minted only by apps/superadmin: see " +
      "docs/decisions/superadmin-view-as.md.",
    mustContain: ["claimViewAs"],
  },
  "v1/auth/register/center": {
    reason: "public registration",
    mustContain: ["withRateLimit"],
  },
  "v1/auth/register/parent": {
    reason: "public registration",
    mustContain: ["withRateLimit"],
  },
  "v1/auth/register/student": {
    reason: "public registration",
    mustContain: ["withRateLimit"],
  },
  "v1/auth/register/teacher": {
    reason: "public registration",
    mustContain: ["withRateLimit"],
  },
  "v1/contact": {
    reason: "public contact form",
    mustContain: ["withRateLimit"],
  },
  "v1/guardian/verify": {
    reason:
      "guardian confirms their address from a clicked link — the caller has no " +
      "account, so the single-use token IS the credential. Safe because success " +
      "grants nothing but a timestamp: this purpose is deliberately absent from " +
      "CLAIMABLE, so it can never mint a session.",
    mustContain: ["withRateLimit", "confirmGuardianEmail"],
  },
  "v1/cron/[job]": {
    reason: "cron endpoint — CRON_SECRET fails closed in every env (M7)",
    mustContain: ["CRON_SECRET"],
  },
  "v1/internal/chat-notify": {
    reason: "server↔server bridge from apps/realtime (M2 dedicated secret)",
    mustContain: ["requireDedicatedSecret"],
  },
  "v1/security/csp-report": {
    reason:
      "the BROWSER posts CSP violation reports, with no session and no CORS " +
      "preflight; requiring auth would collect violations only from signed-in " +
      "users and so miss the login page — the surface an injection attack " +
      "cares most about. Bounded by a per-IP bucket instead.",
    mustContain: ["withRateLimit"],
  },
  "v1/payments/availability": {
    reason:
      "one boolean — may the UI offer an online checkout (MVP blocker #2). " +
      "Leaks nothing; the gateway initiators assert the same predicate " +
      "server-side, so this endpoint informs and never authorizes.",
    getOnly: true,
  },
  "v1/payments/paymob/webhook": {
    reason: "gateway webhook — authenticity is the HMAC over the raw body",
    mustContain: ["verifyWebhook"],
  },
  "v1/centers/[id]": {
    reason: "public center profile for discovery/browse",
    getOnly: true,
  },
  "v1/search/centers": {
    reason: "public discovery search",
    mustContain: ["withRateLimit"],
    getOnly: true,
  },
  "v1/search/teachers": {
    reason: "public discovery search",
    mustContain: ["withRateLimit"],
    getOnly: true,
  },
  "v1/subjects": {
    reason: "public education-catalog read (permanent reference data)",
    getOnly: true,
  },
  "v1/teachers/[teacherId]": {
    reason: "public teacher profile for discovery/browse",
    getOnly: true,
  },
};

const RAW_JSON_ALLOWED: Record<string, PublicEntry> = {};

const RAW_TEXT_ALLOWED: Record<string, PublicEntry> = {
  "v1/security/csp-report": {
    reason:
      "reports arrive in two wire formats (application/csp-report and " +
      "application/reports+json) and a hostile client can send neither; the " +
      "body is size-capped and parsed defensively rather than trusted to a " +
      "schema, and a malformed one is dropped, never 400'd back at a browser " +
      "that cannot act on it.",
    mustContain: ["MAX_BODY_BYTES"],
  },

  "v1/payments/paymob/webhook": {
    reason: "HMAC must be computed over the raw request bytes",
    mustContain: ["verifyWebhook"],
  },
};

const FORM_DATA_ALLOWED = new Set([
  "v1/auth/view-as/claim",
  "v1/materials",
  "v1/materials/[id]",
  "v1/centers/me/logo",
  "v1/teachers/me/photo",
  "v1/rooms/[id]/photos",
]);

const WRITE_METHOD_RE = /export (?:async )?(?:function|const) (POST|PUT|PATCH|DELETE)\b/;
const ANY_METHOD_RE =
  /export (?:async )?(?:function|const) (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b|export const \{[^}]*(?:GET|POST)[^}]*\}/;

const files = collectRouteFiles(API_ROOT);
const sources = new Map(files.map((f) => [routeKey(f), readFileSync(f, "utf8")]));

describe("route conventions (all api routes)", () => {
  it("glob actually found the route surface", () => {
    expect(files.length).toBeGreaterThanOrEqual(200);
  });

  it("every route exports at least one HTTP method", () => {
    const missing = [...sources.entries()]
      .filter(([, src]) => !ANY_METHOD_RE.test(src))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("every route exports dynamic = 'force-dynamic'", () => {
    const missing = [...sources.entries()]
      .filter(([, src]) => !/export const dynamic\s*=\s*"force-dynamic"/.test(src))
      .map(([key]) => key);
    expect(missing).toEqual([]);
  });

  it("every route is auth-wrapped or explicitly public", () => {
    const unguarded = [...sources.entries()]
      .filter(
        ([key, src]) =>
          !AUTH_TOKENS.some((t) => src.includes(t)) && !(key in PUBLIC_ROUTES),
      )
      .map(([key]) => key);
    expect(unguarded).toEqual([]);
  });

  it("public allowlist entries are fresh and keep their gates", () => {
    for (const [key, entry] of Object.entries(PUBLIC_ROUTES)) {
      const src = sources.get(key);
      expect(src, `allowlisted route no longer exists: ${key}`).toBeDefined();
      expect(
        AUTH_TOKENS.some((t) => src!.includes(t)),
        `${key} now uses an auth wrapper — remove it from PUBLIC_ROUTES`,
      ).toBe(false);
      for (const marker of entry.mustContain ?? []) {
        expect(
          src!.includes(marker),
          `${key} lost its gate marker "${marker}" (${entry.reason})`,
        ).toBe(true);
      }
      if (entry.getOnly) {
        expect(
          WRITE_METHOD_RE.test(src!),
          `${key} is a public read surface but exports a write method`,
        ).toBe(false);
      }
    }
  });

  it("no raw req.json() anywhere (allowlist empty, kept for future exceptions)", () => {
    const offenders = [...sources.entries()]
      .filter(([key, src]) => /\b(?:req|request)\.json\(\)/.test(src) && !(key in RAW_JSON_ALLOWED))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
    for (const [key, entry] of Object.entries(RAW_JSON_ALLOWED)) {
      const src = sources.get(key);
      expect(src, `allowlisted route no longer exists: ${key}`).toBeDefined();
      for (const marker of entry.mustContain ?? []) {
        expect(src!.includes(marker), `${key}: ${entry.reason}`).toBe(true);
      }
    }
  });

  it("no raw req.text() outside the webhook", () => {
    const offenders = [...sources.entries()]
      .filter(([key, src]) => /\b(?:req|request)\.text\(\)/.test(src) && !(key in RAW_TEXT_ALLOWED))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });

  it("formData() only in the known upload routes", () => {
    const offenders = [...sources.entries()]
      .filter(([key, src]) => src.includes("formData()") && !FORM_DATA_ALLOWED.has(key))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
    for (const key of FORM_DATA_ALLOWED) {
      expect(sources.get(key), `allowlisted upload route no longer exists: ${key}`).toBeDefined();
    }
  });
});
