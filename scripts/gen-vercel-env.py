"""Split .env.production into one env file per app, for pasting into Vercel.

    python3 scripts/gen-vercel-env.py

Writes .env-erp, .env-superadmin, .env-www and .env-realtime at the repo root.
All four are gitignored by the `.env*` rule; this script is not, and holds no
secret of its own — it only reads and routes what .env.production already has.

WHY THIS EXISTS RATHER THAN A HAND-COPY. .env.production is the union of four
apps' keys, because all four symlink it locally. Pasting it whole into a Vercel
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

MISSING = "REPLACE_ME"

# Empty on purpose, not missing. Marking these REPLACE_ME would send Ali hunting
# for a value that does not exist — and an env var set to the literal string
# "REPLACE_ME" is worse than an unset one, because the code's own "is it
# configured?" checks read it as configured.
OPTIONAL = {
    "MAIL_REPLY_TO",              # falls back to MAIL_FROM
    "TRUSTED_CLIENT_IP_HEADER",   # M3; only for a proxy with a non-standard header
    "SMS_PROVIDER",               # no SMS driver wired
    "PAYMOB_API_KEY",             # only read when PAYMENTS_MODE is sandbox/live
    "PAYMOB_INTEGRATION_ID_CARD",
    "PAYMOB_INTEGRATION_ID_WALLET",
    "WHATSAPP_TOKEN",             # only read when WHATSAPP_MODE is not 'mock'
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

# ── ERP ────────────────────────────────────────────────────────────────────
emit(".env-erp", "Vercel project: ERP (apps/erp) — the product",
 ["Every URL here is this deployment's own host. If the Vercel project ends up",
  "on a different hostname, change all of them together.",
  "APP_ORIGIN and APP_INTERNAL_URL are deliberately ABSENT: only apps/realtime",
  "reads them (apps/realtime/src/env.ts), and that runs on Railway."],
 [("Public URLs", ["NEXTAUTH_URL","APP_BASE_URL","NEXT_PUBLIC_APP_URL","MARKETING_SITE_URL","SUPERADMIN_BASE_URL"]),
  ("Secrets — required in production, no fallback",
     ["NEXTAUTH_SECRET","STUDENT_QR_SECRET","VIEW_AS_SECRET","REALTIME_JWT_SECRET","INTERNAL_API_SECRET","CRON_SECRET"]),
  ("Database — role edura_app, never neondb_owner",
     ["DATABASE_URL","DIRECT_URL","ADMIN_URL","DATABASE_DRIVER","DATABASE_POOL_MAX"]),
  ("Payments", ["PAYMENTS_MODE","PAYMOB_HMAC_SECRET","PAYMOB_API_KEY",
     "PAYMOB_INTEGRATION_ID_CARD","PAYMOB_INTEGRATION_ID_WALLET"]),
  ("Mail", ["MAIL_PROVIDER","MAIL_FROM","MAIL_REPLY_TO","SMTP_HOST","SMTP_PORT",
     "SMTP_SECURE","SMTP_USER","SMTP_PASS"]),
  ("Invites and guardian gate", ["INVITE_CHANNELS","INVITE_TOKEN_TTL_HOURS",
     "WALKIN_TOKEN_TTL_HOURS","GUARDIAN_EMAIL_GRACE_DAYS","GUARDIAN_REMINDER_EVERY_DAYS"]),
  ("WhatsApp", ["WHATSAPP_MODE","WHATSAPP_API_VERSION","WHATSAPP_TOKEN","WHATSAPP_PHONE_ID"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET",
     "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Realtime (the Railway service)", ["NEXT_PUBLIC_REALTIME_URL","REALTIME_INTERNAL_URL"]),
  ("Web push", ["VAPID_PRIVATE_KEY","NEXT_PUBLIC_VAPID_PUBLIC_KEY","VAPID_SUBJECT"]),
  ("Rate limiting and proxy", ["REDIS_URL","TRUSTED_PROXY_HOPS","TRUSTED_CLIENT_IP_HEADER"])],
 {"NEXTAUTH_URL": ERP_URL, "APP_BASE_URL": ERP_URL,
  "NEXT_PUBLIC_APP_URL": ERP_URL, "MARKETING_SITE_URL": WWW_URL,
  "SUPERADMIN_BASE_URL": SA_URL})

# ── superadmin ─────────────────────────────────────────────────────────────
emit(".env-superadmin", "Vercel project: superadmin (apps/superadmin) — the back office",
 ["NEXTAUTH_SECRET is deliberately ABSENT. apps/superadmin/src/lib/auth/auth.ts:48",
  "treats it as a DEV-ONLY fallback; production must use its own secret, so that a",
  "leak of one app's secret cannot mint the other's sessions (M2).",
  "STUDENT_QR_SECRET must stay IDENTICAL to the ERP's — a card printed here has to",
  "verify at an ERP counter. VIEW_AS_SECRET likewise: this app signs the handoff",
  "token and the ERP verifies it.",
  "ERP_BASE_URL is its OWN variable because APP_BASE_URL here is this app's host,",
  "so every generic URL resolver would answer 'the back office' and post a live",
  "credential to a route that only exists in the other app."],
 [("Public URLs — this app signs in at its OWN host", ["NEXTAUTH_URL","APP_BASE_URL","ERP_BASE_URL"]),
  ("Secrets", ["SUPERADMIN_NEXTAUTH_SECRET","STUDENT_QR_SECRET","VIEW_AS_SECRET","INTERNAL_API_SECRET"]),
  ("Database", ["DATABASE_URL","DIRECT_URL","ADMIN_URL","DATABASE_DRIVER","DATABASE_POOL_MAX"]),
  ("Mail", ["MAIL_PROVIDER","MAIL_FROM","SMTP_HOST","SMTP_PORT","SMTP_SECURE","SMTP_USER","SMTP_PASS"]),
  ("Media", ["CLOUDINARY_CLOUD_NAME","CLOUDINARY_API_KEY","CLOUDINARY_API_SECRET",
     "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]),
  ("Rate limiting and proxy", ["REDIS_URL","TRUSTED_PROXY_HOPS","TRUSTED_CLIENT_IP_HEADER"])],
 {"NEXTAUTH_URL": SA_URL, "APP_BASE_URL": SA_URL, "ERP_BASE_URL": ERP_URL})

# ── www ────────────────────────────────────────────────────────────────────
emit(".env-www", "Vercel project: www (apps/www) — the marketing site",
 ["No database, no auth, no session. Do not paste anything else here.",
  "NEXT_PUBLIC_SITE_URL is OPTIONAL: siteOrigin() falls back to Vercel's own",
  "VERCEL_PROJECT_PRODUCTION_URL, so pin it only once a final domain exists.",
  "Delete the NEXT_PUBLIC_SITE_URL line if you would rather use that fallback."],
 [("Where the login / register CTAs point (the ERP)", ["NEXT_PUBLIC_APP_ORIGIN"]),
  ("This site's own canonical origin — optional", ["NEXT_PUBLIC_SITE_URL"])],
 {"NEXT_PUBLIC_APP_ORIGIN": ERP_URL, "NEXT_PUBLIC_SITE_URL": WWW_URL})

# ── realtime ───────────────────────────────────────────────────────────────
emit(".env-realtime", "Railway service: realtime (apps/realtime) — NOT a Vercel project",
 ["Included because it is the fourth app and shares these secrets. Railway, not Vercel.",
  "APP_ORIGIN is the browser origin allowed to open a socket; APP_INTERNAL_URL is",
  "where this service calls the ERP back. Both are the ERP's host.",
  "REALTIME_JWT_SECRET and INTERNAL_API_SECRET must MATCH the ERP's values exactly."],
 [("The ERP it serves", ["APP_ORIGIN","APP_INTERNAL_URL"]),
  ("Shared secrets — identical to the ERP", ["REALTIME_JWT_SECRET","INTERNAL_API_SECRET"]),
  ("Database", ["DATABASE_URL","DATABASE_DRIVER"]),
  ("Port", ["REALTIME_PORT"])],
 {"APP_ORIGIN": ERP_URL, "APP_INTERNAL_URL": ERP_URL})
