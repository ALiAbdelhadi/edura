"""Split .env.production into one env file per deployable, for pasting into
Vercel (the three frontends) and Railway (the three services).

    python3 scripts/gen-vercel-env.py

Writes .env-erp, .env-superadmin, .env-www (Vercel) and .env-api,
.env-admin-api, .env-realtime (Railway) at the repo root. All six are
gitignored by the `.env*` rule; this script is not, and holds no secret of its
own — it only reads and routes what .env.production already has.

The frontends hold no database, auth or payment secret: the backend left the
Next apps (docs/decisions/backend-separation.md). Those keys go to .env-api and
.env-admin-api only.

WHY THIS EXISTS RATHER THAN A HAND-COPY. .env.production is the union of every
app's keys, because they symlink it locally. Pasting it whole into one
project hands that project every other project's secrets. The per-app allowlists
below are the routing table, and three of their entries are things a hand-copy
reliably gets wrong — see docs/runbooks/vercel-project-recreate.md.

Re-running is safe: a secret already present in .env.production is reused, never
rotated. Only a missing one is minted.
"""
import io, os, re, base64, secrets, sys

ROOT = "/Users/ali/edura"
SRC = os.path.join(ROOT, ".env.production")

def parse(path):
    d = {}
    for line in io.open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line or line.lstrip().startswith("#"): continue
        if "=" not in line: continue
        k, v = line.split("=", 1)
        d[k.strip()] = v
    return d

env = parse(SRC)

ERP_URL   = "https://edura-erp.vercel.app"
SA_URL    = "https://edura-superadmin.vercel.app"
WWW_URL   = "https://edura-www.vercel.app"

def ensure_secret(key, why):
    """Generate a locally-owned secret if absent, and persist it to .env.production.

    Only for values this system MINTS, never for a credential issued by a third
    party. PAYMOB_HMAC_SECRET qualifies while PAYMENTS_MODE=mock: mock-driver.ts
    signs its own webhook with it, so any random value is correct until a real
    Paymob account exists and hands over the real one.
    """
    cur = env.get(key)
    if cur and cur != "REPLACE":
        print("%-22s already present — reused, not regenerated" % key)
        return
    val = base64.b64encode(secrets.token_bytes(32)).decode()
    src = io.open(SRC, encoding="utf-8").read()
    if re.search(r"^%s=" % key, src, re.M):
        src = re.sub(r"^%s=.*$" % key, "%s=%s" % (key, val), src, count=1, flags=re.M)
    else:
        src = src.rstrip("\n") + "\n\n# %s\n%s=%s\n" % (why, key, val)
    io.open(SRC, "w", encoding="utf-8").write(src)
    env[key] = val
    print("%-22s GENERATED (%d chars), written to .env.production" % (key, len(val)))

ensure_secret("STUDENT_QR_SECRET",
              "Signs every student ID card QR. Same value on ERP and superadmin.")
ensure_secret("VIEW_AS_SECRET",
              "Signs the back-office 'view as' handoff token. Same value on ERP "
              "and superadmin: superadmin signs, the ERP verifies, and a mismatch "
              "is indistinguishable from a forgery.")
ensure_secret("PAYMOB_HMAC_SECRET",
              "Signs the mock gateway's own webhooks. Replace with Paymob's real "
              "secret when PAYMENTS_MODE stops being 'mock'.")
ensure_secret("EDURA_PROXY_SECRET",
              "Vouches for the client IP a frontend proxy stamps for its service. "
              "Same value on a frontend and the service behind it; rotate together.")

# ADMIN_URL is deliberately NOT emitted to any Vercel file. It is the database
# OWNER string, no app reads it (only packages/database/scripts/* do), and
# src/extensions/index.ts refuses to serve at all under a BYPASSRLS role:
# "ADMIN_URL — those must never appear in a serving environment."
MISSING = "REPLACE_ME"

OPTIONAL = {
    "MAIL_REPLY_TO",
    "TRUSTED_CLIENT_IP_HEADER",
    "SMS_PROVIDER",
    "PAYMOB_INTEGRATION_IDS",
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_ID",
}

def emit(filename, title, notes, groups, overrides):
    out = ["# " + title, "#"]
    out += ["# " + n for n in notes]
    out += ["# Generated from .env.production. Gitignored — never commit this file.", ""]
    unresolved = []
    optional_blank = []
    for gname, keys in groups:
        lines = []
        for k in keys:
            v = overrides.get(k, env.get(k))
            if v is None or v == "" or v == "REPLACE":
                if k in OPTIONAL:
                    v = ""
                    optional_blank.append(k)
                else:
                    v = MISSING
                    unresolved.append(k)
            lines.append("%s=%s" % (k, v))
        if lines:
            out.append("# --- %s" % gname)
            out += lines
            out.append("")
    path = os.path.join(ROOT, filename)
    io.open(path, "w", encoding="utf-8").write("\n".join(out).rstrip("\n") + "\n")
    print("%-22s %2d keys | MUST FILL: %s | blank on purpose: %d" % (
        filename, sum(len(k) for _, k in groups),
        ", ".join(unresolved) if unresolved else "none",
        len(optional_blank)))

MAIL = ["MAIL_PROVIDER","MAIL_FROM","MAIL_REPLY_TO","SMTP_HOST","SMTP_PORT",
        "SMTP_SECURE","SMTP_USER","SMTP_PASS"]
PROXY = ["TRUSTED_PROXY_HOPS","TRUSTED_CLIENT_IP_HEADER"]
PROD = {"NODE_ENV": "production", "EDURA_ENV": "production"}

emit(".env-erp", "Vercel project: ERP (apps/erp) — the product's frontend",
 ["No database, auth or payment secret belongs here: apps/erp has no routes of",
  "its own and rewrites every /api call to API_SERVICE_URL.",
  "API_SERVICE_URL is the apps/api Railway https origin. EDURA_PROXY_SECRET must",
  "MATCH .env-api exactly — the proxy signs the client IP it stamps with it."],
 [("Public URLs", ["APP_BASE_URL","MARKETING_SITE_URL"]),
  ("The API service", ["API_SERVICE_URL","EDURA_PROXY_SECRET"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Realtime (the Railway service)", ["NEXT_PUBLIC_REALTIME_URL"]),
  ("Web push", ["NEXT_PUBLIC_VAPID_PUBLIC_KEY"]),
  ("Observability — next.config.ts refuses to build for production without this",
     ["NEXT_PUBLIC_SENTRY_DSN"]),
  ("Which address the proxy stamps as the client IP", PROXY)],
 {"APP_BASE_URL": ERP_URL, "MARKETING_SITE_URL": WWW_URL})

emit(".env-api", "Railway service: api (apps/api) — the ERP backend, NOT a Vercel project",
 ["NEXTAUTH_URL is the ERP FRONTEND origin, not this service's Railway URL: the",
  "browser only ever talks to the frontend, and cookies are scoped to it.",
  "Every other URL here is likewise a public host.",
  "EDURA_PROXY_SECRET must MATCH .env-erp exactly."],
 [("Runtime", ["NODE_ENV","EDURA_ENV"]),
  ("Public URLs", ["NEXTAUTH_URL","APP_BASE_URL","NEXT_PUBLIC_APP_URL","MARKETING_SITE_URL","SUPERADMIN_BASE_URL"]),
  ("Secrets — required in production, no fallback",
     ["NEXTAUTH_SECRET","EDURA_PROXY_SECRET","STUDENT_QR_SECRET","VIEW_AS_SECRET",
      "REALTIME_JWT_SECRET","INTERNAL_API_SECRET","CRON_SECRET"]),
  ("Database — role edura_app, never neondb_owner",
     ["DATABASE_URL","DATABASE_DRIVER","DATABASE_POOL_MAX"]),
  ("Payments", ["PAYMENTS_MODE","PAYMOB_HMAC_SECRET","PAYMOB_INTEGRATION_IDS"]),
  ("Mail", MAIL),
  ("Invites and guardian gate", ["INVITE_CHANNELS","INVITE_TOKEN_TTL_HOURS",
     "WALKIN_TOKEN_TTL_HOURS","GUARDIAN_EMAIL_GRACE_DAYS","GUARDIAN_REMINDER_EVERY_DAYS"]),
  ("WhatsApp", ["WHATSAPP_MODE","WHATSAPP_API_VERSION","WHATSAPP_TOKEN","WHATSAPP_PHONE_ID"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET",
     "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Realtime (the Railway service)", ["NEXT_PUBLIC_REALTIME_URL","REALTIME_INTERNAL_URL"]),
  ("Web push", ["VAPID_PRIVATE_KEY","NEXT_PUBLIC_VAPID_PUBLIC_KEY","VAPID_SUBJECT"]),
  ("Rate limiting and proxy", ["REDIS_URL"] + PROXY)],
 dict(PROD, **{"NEXTAUTH_URL": ERP_URL, "APP_BASE_URL": ERP_URL,
  "NEXT_PUBLIC_APP_URL": ERP_URL, "MARKETING_SITE_URL": WWW_URL,
  "SUPERADMIN_BASE_URL": SA_URL}))

emit(".env-superadmin", "Vercel project: superadmin (apps/superadmin) — the back office's frontend",
 ["No database or auth secret belongs here: every /api call is rewritten to",
  "ADMIN_API_SERVICE_URL, the apps/admin-api Railway https origin.",
  "EDURA_PROXY_SECRET must MATCH .env-admin-api exactly.",
  "ERP_BASE_URL is its OWN variable because APP_BASE_URL here is this app's host."],
 [("Public URLs", ["APP_BASE_URL","ERP_BASE_URL"]),
  ("The admin API service", ["ADMIN_API_SERVICE_URL","EDURA_PROXY_SECRET"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Observability — next.config.ts refuses to build for production without this",
     ["NEXT_PUBLIC_SENTRY_DSN"]),
  ("Which address the proxy stamps as the client IP", PROXY)],
 {"APP_BASE_URL": SA_URL, "ERP_BASE_URL": ERP_URL})

emit(".env-admin-api", "Railway service: admin-api (apps/admin-api) — the back-office backend, NOT a Vercel project",
 ["NEXTAUTH_SECRET is deliberately ABSENT: production must use its own secret, so",
  "that a leak of one backend's secret cannot mint the other's sessions (M2).",
  "NEXTAUTH_URL is the superadmin FRONTEND origin, not this service's Railway URL.",
  "STUDENT_QR_SECRET must stay IDENTICAL to .env-api — a card printed here has to",
  "verify at an ERP counter. VIEW_AS_SECRET likewise: this service signs the",
  "handoff token and apps/api verifies it.",
  "ERP_BASE_URL is the ERP PUBLIC origin: a browser opens the view-as claim URL",
  "and the reset links built from it.",
  "EDURA_PROXY_SECRET must MATCH .env-superadmin exactly."],
 [("Runtime", ["NODE_ENV","EDURA_ENV"]),
  ("Public URLs — sign-in happens at the frontend's host", ["NEXTAUTH_URL","APP_BASE_URL","ERP_BASE_URL"]),
  ("Secrets", ["SUPERADMIN_NEXTAUTH_SECRET","EDURA_PROXY_SECRET","STUDENT_QR_SECRET",
     "VIEW_AS_SECRET","INTERNAL_API_SECRET"]),
  ("Database", ["DATABASE_URL","DATABASE_DRIVER","DATABASE_POOL_MAX"]),
  ("Mail", [k for k in MAIL if k != "MAIL_REPLY_TO"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET",
     "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Rate limiting and proxy", ["REDIS_URL"] + PROXY)],
 dict(PROD, **{"NEXTAUTH_URL": SA_URL, "APP_BASE_URL": SA_URL, "ERP_BASE_URL": ERP_URL}))

emit(".env-www", "Vercel project: www (apps/www) — the marketing site",
 ["No database, no auth, no session. Do not paste anything else here.",
  "NEXT_PUBLIC_SITE_URL is OPTIONAL: siteOrigin() falls back to Vercel's own",
  "VERCEL_PROJECT_PRODUCTION_URL, so pin it only once a final domain exists.",
  "Delete the NEXT_PUBLIC_SITE_URL line if you would rather use that fallback."],
 [("Where the login / register CTAs point (the ERP)", ["NEXT_PUBLIC_APP_ORIGIN"]),
  ("This site's own canonical origin — optional", ["NEXT_PUBLIC_SITE_URL"])],
 {"NEXT_PUBLIC_APP_ORIGIN": ERP_URL, "NEXT_PUBLIC_SITE_URL": WWW_URL})

emit(".env-realtime", "Railway service: realtime (apps/realtime) — NOT a Vercel project",
 ["Included because it shares these secrets. Railway, not Vercel.",
  "APP_ORIGIN is the browser origin allowed to open a socket; APP_INTERNAL_URL is",
  "where this service calls the ERP back. Both are the ERP's public host, whose",
  "/api paths are rewritten to apps/api.",
  "REALTIME_JWT_SECRET and INTERNAL_API_SECRET must MATCH .env-api exactly."],
 [("The ERP it serves", ["APP_ORIGIN","APP_INTERNAL_URL"]),
  ("Shared secrets — identical to apps/api", ["REALTIME_JWT_SECRET","INTERNAL_API_SECRET"]),
  ("Database", ["DATABASE_URL","DATABASE_DRIVER"]),
  ("Port", ["REALTIME_PORT"])],
 # DATABASE_DRIVER is pg here, not the ws the shared source carries: Railway
 # runs a long-lived process with a direct TCP connection, while ws is for the
 # serverless Vercel apps. Matches the live Railway config (verified 2026-08-28).
 {"APP_ORIGIN": ERP_URL, "APP_INTERNAL_URL": ERP_URL, "DATABASE_DRIVER": "pg"})
