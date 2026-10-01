/**
 * Interactive environment setup — one secret at a time, hidden, per environment.
 *
 *     bun scripts/setup-env.ts                  # all three environments
 *     bun scripts/setup-env.ts --only dev       # one environment
 *     bun scripts/setup-env.ts --plan           # show what would be asked, ask nothing
 *     bun scripts/setup-env.ts --checklist      # print the Vercel/Railway checklist only
 *     bun scripts/setup-env.ts --write-examples # emit the .env.example templates
 *     bun scripts/setup-env.ts --rotate KEY,KEY # re-ask keys that already have a value
 *
 * WHAT IT GUARANTEES
 *
 *   - Values are read from /dev/tty in raw mode and never echoed, so nothing
 *     reaches the terminal scrollback and nothing reaches shell history. Never
 *     pass a secret as an argv element; there is deliberately no flag for it.
 *   - Every write target is checked against git twice — refused if the path is
 *     tracked, and refused if `git check-ignore` does not claim it.
 *   - Values are never printed back. A value is reported as a length plus a
 *     fingerprint salted with a per-run random, which lets you confirm that two
 *     files got the SAME secret without the fingerprint meaning anything outside
 *     this run.
 *   - Files are written 0600, atomically (temp file in the same directory, then
 *     rename), preserving every line the script did not set.
 *   - A key that already holds a real value is left alone unless --rotate names
 *     it. Nothing is silently regenerated.
 *
 * WHAT IT IS NOT
 *
 *   It does not talk to Neon, Vercel, Railway or Upstash, and it runs no
 *   migration. It fills files. The database walkthrough is a separate, manual
 *   sequence — see docs/runbooks/, and the checklist this prints at the end.
 */

import { randomBytes, createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReadStream } from "node:tty";

const ROOT = path.resolve(import.meta.dirname, "..");
const RUN_SALT = randomBytes(16);

/* ────────────────────────────────────────────────────────────────────────────
 * Targets — the file each value belongs in.
 * ──────────────────────────────────────────────────────────────────────────── */

type TargetId =
  | "db.dev"
  | "db.test"
  | "db.prod"
  | "erp.dev"
  | "sa.dev"
  | "rt.dev"
  | "www.dev"
  | "prod";

const TARGETS: Record<TargetId, { file: string; title: string }> = {
  "db.dev": {
    file: "packages/database/.env.local",
    title: "@repo/database — dev branch (migrations, seeds, verify, db suites)",
  },
  "db.test": {
    file: "packages/database/.env.test",
    title: "@repo/database — test branch (reached with EDURA_ENV=test)",
  },
  "db.prod": {
    file: "packages/database/.env.production",
    title:
      "@repo/database — production branch (reached with EDURA_ENV=production)",
  },
  "erp.dev": { file: "apps/erp/.env.local", title: "apps/erp — local dev" },
  "sa.dev": {
    file: "apps/superadmin/.env.local",
    title: "apps/superadmin — local dev",
  },
  "rt.dev": {
    file: "apps/realtime/.env.local",
    title: "apps/realtime — local dev",
  },
  "www.dev": { file: "apps/www/.env.local", title: "apps/www — local dev" },
  prod: {
    file: ".env.production",
    title:
      "production union — the source scripts/gen-vercel-env.py splits per app",
  },
};

/* ────────────────────────────────────────────────────────────────────────────
 * Validators. Each returns null when the value is acceptable, or the reason.
 * ──────────────────────────────────────────────────────────────────────────── */

type Validator = (v: string) => string | null;

const PLACEHOLDERS = [
  "replace",
  "replace_me",
  "changeme",
  "change_me",
  "todo",
  "xxx",
  "your-",
  "<",
  "example.com",
];

const notPlaceholder: Validator = (v) => {
  const low = v.toLowerCase();
  if (!v.trim()) return "empty";
  if (PLACEHOLDERS.some((p) => low === p || low.startsWith(p)))
    return "that looks like a placeholder, not a real value";
  if (/\s/.test(v))
    return "contains whitespace — a pasted secret should have none";
  return null;
};

const all =
  (...fns: Validator[]): Validator =>
  (v) => {
    for (const f of fns) {
      const r = f(v);
      if (r) return r;
    }
    return null;
  };

const pgUrl: Validator = (v) => {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "not a URL";
  }
  if (u.protocol !== "postgresql:" && u.protocol !== "postgres:")
    return `scheme is "${u.protocol}" — a Neon string starts postgresql://`;
  if (!u.username) return "no role in the string (expected neondb_owner)";
  if (!u.password) return "no password in the string";
  if (!u.hostname) return "no host";
  if (u.pathname.replace("/", "").length === 0) return "no database name";
  if (!u.hostname.endsWith(".neon.tech"))
    return `host "${u.hostname}" is not a *.neon.tech endpoint`;
  return null;
};

const redisUrl: Validator = (v) => {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "not a URL";
  }
  if (u.protocol === "redis:")
    return "plaintext redis:// — the rate-limit store must be rediss:// (TLS). A single-instance deploy that accepts the weaker guarantee sets ALLOW_PLAINTEXT_REDIS=1 by hand, deliberately";
  if (u.protocol !== "rediss:") return `scheme is "${u.protocol}", expected rediss://`;
  if (!u.password) return "no password — an Upstash URL carries the token as the password";
  if (!u.hostname) return "no host";
  return null;
};

const cloudinaryKey: Validator = (v) =>
  /^\d{15}$/.test(v) ? null : "a Cloudinary API key is 15 digits";

const cloudinarySecret: Validator = (v) =>
  /^[A-Za-z0-9_-]{20,50}$/.test(v)
    ? null
    : "a Cloudinary API secret is ~27 URL-safe characters";

const cloudinaryCloud: Validator = (v) =>
  /^[a-z0-9][a-z0-9_-]{1,40}$/.test(v)
    ? null
    : "a cloud name is lowercase letters, digits, - and _";

const emailish: Validator = (v) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? null : "not an email address";

const hostname: Validator = (v) =>
  /^[a-z0-9.-]+$/i.test(v) && v.includes(".") ? null : "not a hostname";

const port: Validator = (v) =>
  /^\d+$/.test(v) && +v > 0 && +v < 65536 ? null : "not a port number";

const minLen =
  (n: number): Validator =>
  (v) =>
    v.length >= n ? null : `too short — at least ${n} characters`;

const sentryDsn: Validator = (v) =>
  /^https:\/\/[a-f0-9]+@[a-z0-9.-]+\/\d+$/i.test(v)
    ? null
    : "expected https://<key>@<host>/<project-id>";

const vapidPublic: Validator = (v) =>
  /^[A-Za-z0-9_-]{85,90}$/.test(v)
    ? null
    : "a VAPID public key is ~87 URL-safe base64 characters";

const vapidPrivate: Validator = (v) =>
  /^[A-Za-z0-9_-]{42,46}$/.test(v)
    ? null
    : "a VAPID private key is ~43 URL-safe base64 characters";

const digits: Validator = (v) =>
  /^\d+$/.test(v) ? null : "expected digits only";

/* ────────────────────────────────────────────────────────────────────────────
 * The specification. This is the single source of truth for which variable
 * lives in which file — there are no .env.example templates in this repo, so
 * --write-examples generates them FROM here rather than the other way round.
 * ──────────────────────────────────────────────────────────────────────────── */

type Item =
  | {
      kind: "ask";
      key: string;
      group: string;
      targets: TargetId[];
      what: string;
      where: string;
      validate: Validator;
      optional?: boolean;
    }
  | {
      kind: "mint";
      key: string;
      group: string;
      targets: TargetId[];
      what: string;
      bytes?: number;
    }
  | {
      kind: "fixed";
      key: string;
      group: string;
      targets: TargetId[];
      value: string;
      what: string;
    };

const ERP_URL = "https://edura-erp.vercel.app";
const SA_URL = "https://edura-superadmin.vercel.app";
const WWW_URL = "https://edura-www.vercel.app";

/** dev: every app plus the database package. */
const DEV_APPS: TargetId[] = ["erp.dev", "sa.dev"];

function devItems(): Item[] {
  return [
    // ── database (the Neon block is handled separately, before these)
    {
      kind: "fixed",
      key: "DATABASE_DRIVER",
      group: "Database",
      targets: ["db.dev", ...DEV_APPS],
      value: "ws",
      what: "Neon serverless driver over WebSockets",
    },
    {
      kind: "fixed",
      key: "DATABASE_DRIVER",
      group: "Database",
      targets: ["rt.dev"],
      value: "pg",
      what: "realtime is a long-lived process — plain TCP, not ws",
    },
    {
      kind: "fixed",
      key: "DATABASE_POOL_MAX",
      group: "Database",
      targets: ["db.dev", ...DEV_APPS],
      value: "10",
      what: "pg pool ceiling",
    },
    {
      kind: "fixed",
      key: "EDURA_ALLOW_DB_ENVS",
      group: "Database",
      targets: ["db.dev", ...DEV_APPS],
      value: "dev",
      what: "lets the DB suites run against the dev branch (never production — db-guard throws)",
    },

    // ── seed identities
    {
      kind: "ask",
      key: "SEED_SUPERADMIN_EMAIL",
      group: "Seed accounts",
      targets: ["db.dev"],
      what: "the real super_admin login",
      where: "your choice — it becomes a real account",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_SUPERADMIN_PASSWORD",
      group: "Seed accounts",
      targets: ["db.dev"],
      what: "its password",
      where: "your choice",
      validate: all(notPlaceholder, minLen(12)),
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_EMAIL",
      group: "Seed accounts",
      targets: ["db.dev"],
      what: "the real accountant login",
      where: "your choice",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_PASSWORD",
      group: "Seed accounts",
      targets: ["db.dev"],
      what: "its password",
      where: "your choice",
      validate: all(notPlaceholder, minLen(12)),
    },

    // ── minted secrets
    {
      kind: "mint",
      key: "NEXTAUTH_SECRET",
      group: "App secrets",
      targets: ["erp.dev"],
      what: "signs ERP cookies",
    },
    {
      kind: "mint",
      key: "SUPERADMIN_NEXTAUTH_SECRET",
      group: "App secrets",
      targets: ["sa.dev"],
      what: "the back office's OWN secret — never the ERP's (M2)",
    },
    {
      kind: "mint",
      key: "STUDENT_QR_SECRET",
      group: "App secrets",
      targets: DEV_APPS,
      what: "signs student ID card QRs — IDENTICAL in both apps",
    },
    {
      kind: "mint",
      key: "VIEW_AS_SECRET",
      group: "App secrets",
      targets: DEV_APPS,
      what: "signs the view-as handoff — superadmin signs, ERP verifies",
    },
    {
      kind: "mint",
      key: "REALTIME_JWT_SECRET",
      group: "App secrets",
      targets: ["erp.dev", "rt.dev"],
      what: "the socket handshake — IDENTICAL in ERP and realtime",
    },
    {
      kind: "mint",
      key: "INTERNAL_API_SECRET",
      group: "App secrets",
      targets: ["erp.dev", "sa.dev", "rt.dev"],
      what: "server↔server bridge",
    },
    {
      kind: "mint",
      key: "CRON_SECRET",
      group: "App secrets",
      targets: ["erp.dev"],
      what: "guards /api/v1/cron/[job] — fails closed when unset",
    },
    {
      kind: "mint",
      key: "PAYMOB_HMAC_SECRET",
      group: "Payments",
      targets: ["erp.dev"],
      what: "while PAYMENTS_MODE=mock the mock driver signs its own webhook, so any random value is correct",
    },

    // ── third-party
    {
      kind: "ask",
      key: "REDIS_URL",
      group: "Rate limiting",
      targets: DEV_APPS,
      what: "shared rate-limit store",
      where: "Upstash → database → REST/Redis → the rediss:// URL",
      validate: redisUrl,
      optional: true,
    },
    {
      kind: "ask",
      key: "CLOUDINARY_CLOUD_NAME",
      group: "Media",
      targets: DEV_APPS,
      what: "Cloudinary cloud name (not secret, asked here to keep the trio together)",
      where: "Cloudinary console → Dashboard",
      validate: cloudinaryCloud,
      optional: true,
    },
    {
      kind: "ask",
      key: "CLOUDINARY_API_KEY",
      group: "Media",
      targets: DEV_APPS,
      what: "Cloudinary API key",
      where: "Cloudinary console → Dashboard → API Keys",
      validate: cloudinaryKey,
      optional: true,
    },
    {
      kind: "ask",
      key: "CLOUDINARY_API_SECRET",
      group: "Media",
      targets: DEV_APPS,
      what: "Cloudinary API secret",
      where: "same panel, revealed behind the eye icon",
      validate: cloudinarySecret,
      optional: true,
    },

    // ── local URLs and modes
    {
      kind: "fixed",
      key: "NEXTAUTH_URL",
      group: "URLs",
      targets: ["erp.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "APP_BASE_URL",
      group: "URLs",
      targets: ["erp.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "SUPERADMIN_BASE_URL",
      group: "URLs",
      targets: ["erp.dev"],
      value: "http://localhost:3001",
      what: "",
    },
    {
      kind: "fixed",
      key: "NEXTAUTH_URL",
      group: "URLs",
      targets: ["sa.dev"],
      value: "http://localhost:3001",
      what: "",
    },
    {
      kind: "fixed",
      key: "ERP_BASE_URL",
      group: "URLs",
      targets: ["sa.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "APP_ORIGIN",
      group: "URLs",
      targets: ["rt.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "APP_INTERNAL_URL",
      group: "URLs",
      targets: ["rt.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "REALTIME_PORT",
      group: "URLs",
      targets: ["rt.dev"],
      value: "3005",
      what: "",
    },
    {
      kind: "fixed",
      key: "NEXT_PUBLIC_APP_ORIGIN",
      group: "URLs",
      targets: ["www.dev"],
      value: "http://localhost:3002",
      what: "",
    },
    {
      kind: "fixed",
      key: "PAYMENTS_MODE",
      group: "Modes",
      targets: DEV_APPS,
      value: "mock",
      what: "",
    },
    {
      kind: "fixed",
      key: "WHATSAPP_MODE",
      group: "Modes",
      targets: DEV_APPS,
      value: "mock",
      what: "",
    },
    {
      kind: "fixed",
      key: "MAIL_PROVIDER",
      group: "Modes",
      targets: DEV_APPS,
      value: "console",
      what: "dev delivers nothing — mail is printed",
    },
    {
      kind: "fixed",
      key: "INVITE_CHANNELS",
      group: "Modes",
      targets: DEV_APPS,
      value: "email",
      what: "",
    },
    {
      kind: "fixed",
      key: "TRUSTED_PROXY_HOPS",
      group: "Modes",
      targets: DEV_APPS,
      value: "0",
      what: "no proxy in front of localhost",
    },
  ];
}

function testItems(): Item[] {
  return [
    {
      kind: "fixed",
      key: "DATABASE_DRIVER",
      group: "Database",
      targets: ["db.test"],
      value: "ws",
      what: "",
    },
    {
      kind: "fixed",
      key: "DATABASE_POOL_MAX",
      group: "Database",
      targets: ["db.test"],
      value: "10",
      what: "",
    },
    {
      kind: "ask",
      key: "SEED_SUPERADMIN_EMAIL",
      group: "Seed accounts",
      targets: ["db.test"],
      what: "super_admin login for the test branch",
      where: "your choice — throwaway is fine here",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_SUPERADMIN_PASSWORD",
      group: "Seed accounts",
      targets: ["db.test"],
      what: "its password",
      where: "your choice",
      validate: all(notPlaceholder, minLen(12)),
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_EMAIL",
      group: "Seed accounts",
      targets: ["db.test"],
      what: "accountant login for the test branch",
      where: "your choice",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_PASSWORD",
      group: "Seed accounts",
      targets: ["db.test"],
      what: "its password",
      where: "your choice",
      validate: all(notPlaceholder, minLen(12)),
    },
  ];
}

function prodItems(): Item[] {
  const T: TargetId[] = ["prod"];
  return [
    {
      kind: "fixed",
      key: "DATABASE_DRIVER",
      group: "Database",
      targets: T,
      value: "ws",
      what: "",
    },
    {
      kind: "fixed",
      key: "DATABASE_POOL_MAX",
      group: "Database",
      targets: T,
      value: "10",
      what: "",
    },
    {
      kind: "fixed",
      key: "EDURA_ALLOW_DB_ENVS",
      group: "Database",
      targets: [...T, "db.prod"],
      value: "",
      what: "MUST stay empty — naming production here is a hard error by design",
    },

    {
      kind: "ask",
      key: "SEED_SUPERADMIN_EMAIL",
      group: "Seed accounts",
      targets: ["db.prod"],
      what: "the LIVE super_admin login",
      where: "your real address — this account controls the platform",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_SUPERADMIN_PASSWORD",
      group: "Seed accounts",
      targets: ["db.prod"],
      what: "its password",
      where: "generate one in your password manager first",
      validate: all(notPlaceholder, minLen(16)),
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_EMAIL",
      group: "Seed accounts",
      targets: ["db.prod"],
      what: "the LIVE accountant login",
      where: "your real address",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SEED_ACCOUNTANT_PASSWORD",
      group: "Seed accounts",
      targets: ["db.prod"],
      what: "its password",
      where: "generate one in your password manager first",
      validate: all(notPlaceholder, minLen(16)),
    },

    {
      kind: "mint",
      key: "NEXTAUTH_SECRET",
      group: "App secrets",
      targets: T,
      what: "ERP cookies",
    },
    {
      kind: "mint",
      key: "SUPERADMIN_NEXTAUTH_SECRET",
      group: "App secrets",
      targets: T,
      what: "back-office cookies — a leak of one app's secret must not mint the other's sessions",
    },
    {
      kind: "mint",
      key: "STUDENT_QR_SECRET",
      group: "App secrets",
      targets: T,
      what: "goes on BOTH Vercel projects with the same value",
    },
    {
      kind: "mint",
      key: "VIEW_AS_SECRET",
      group: "App secrets",
      targets: T,
      what: "goes on BOTH Vercel projects with the same value",
    },
    {
      kind: "mint",
      key: "REALTIME_JWT_SECRET",
      group: "App secrets",
      targets: T,
      what: "goes on ERP (Vercel) and realtime (Railway) with the same value",
    },
    {
      kind: "mint",
      key: "INTERNAL_API_SECRET",
      group: "App secrets",
      targets: T,
      what: "goes on all three with the same value",
    },
    {
      kind: "mint",
      key: "CRON_SECRET",
      group: "App secrets",
      targets: T,
      what: "also needs to exist as a GitHub Actions secret for the cron workflow",
    },
    {
      kind: "mint",
      key: "PAYMOB_HMAC_SECRET",
      group: "Payments",
      targets: T,
      what: "replace with Paymob's real value the day PAYMENTS_MODE stops being mock",
    },

    {
      kind: "ask",
      key: "REDIS_URL",
      group: "Rate limiting",
      targets: T,
      what: "REQUIRED in production since M-C — assertSharedRateLimitStore fails the boot without it",
      where: "Upstash → your database → the rediss:// URL",
      validate: redisUrl,
    },
    {
      kind: "fixed",
      key: "TRUSTED_PROXY_HOPS",
      group: "Rate limiting",
      targets: T,
      value: "1",
      what: "Vercel is one hop",
    },

    {
      kind: "ask",
      key: "CLOUDINARY_CLOUD_NAME",
      group: "Media",
      targets: T,
      what: "Cloudinary cloud name",
      where: "Cloudinary console → Dashboard",
      validate: cloudinaryCloud,
    },
    {
      kind: "ask",
      key: "CLOUDINARY_API_KEY",
      group: "Media",
      targets: T,
      what: "Cloudinary API key",
      where: "Cloudinary console → Dashboard → API Keys",
      validate: cloudinaryKey,
    },
    {
      kind: "ask",
      key: "CLOUDINARY_API_SECRET",
      group: "Media",
      targets: T,
      what: "Cloudinary API secret",
      where: "same panel, behind the eye icon",
      validate: cloudinarySecret,
    },

    {
      kind: "ask",
      key: "SMTP_HOST",
      group: "Mail",
      targets: T,
      what: "SMTP host",
      where: "smtp.gmail.com for the current Gmail wiring",
      validate: hostname,
    },
    {
      kind: "ask",
      key: "SMTP_PORT",
      group: "Mail",
      targets: T,
      what: "SMTP port",
      where: "465 for implicit TLS, 587 for STARTTLS",
      validate: port,
    },
    {
      kind: "ask",
      key: "SMTP_USER",
      group: "Mail",
      targets: T,
      what: "SMTP username",
      where: "the sending address",
      validate: emailish,
    },
    {
      kind: "ask",
      key: "SMTP_PASS",
      group: "Mail",
      targets: T,
      what: "SMTP password — a Gmail APP PASSWORD, not the account password",
      where: "Google account → Security → 2-Step Verification → App passwords",
      validate: all(notPlaceholder, minLen(10)),
    },
    {
      kind: "fixed",
      key: "SMTP_SECURE",
      group: "Mail",
      targets: T,
      value: "true",
      what: "true pairs with port 465",
    },
    {
      kind: "fixed",
      key: "MAIL_PROVIDER",
      group: "Mail",
      targets: T,
      value: "smtp",
      what: "console delivers nothing — production must be smtp",
    },
    {
      kind: "ask",
      key: "MAIL_FROM",
      group: "Mail",
      targets: T,
      what: "From header, e.g. Edura <no-reply@yourdomain>",
      where: "your choice; must be an address the SMTP user may send as",
      validate: (v) => (v.includes("@") ? null : "no address in it"),
    },

    {
      kind: "ask",
      key: "NEXT_PUBLIC_SENTRY_DSN",
      group: "Observability",
      targets: T,
      what: "Sentry DSN — next.config.ts REFUSES a production build without it",
      where: "Sentry → project → Client Keys (DSN)",
      validate: sentryDsn,
    },

    {
      kind: "ask",
      key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
      group: "Web push",
      targets: T,
      what: "VAPID public key",
      where: "npx web-push generate-vapid-keys",
      validate: vapidPublic,
      optional: true,
    },
    {
      kind: "ask",
      key: "VAPID_PRIVATE_KEY",
      group: "Web push",
      targets: T,
      what: "VAPID private key",
      where: "the same command's output",
      validate: vapidPrivate,
      optional: true,
    },
    {
      kind: "ask",
      key: "VAPID_SUBJECT",
      group: "Web push",
      targets: T,
      what: "VAPID subject, mailto:you@example",
      where: "your contact address",
      validate: (v) => (v.startsWith("mailto:") ? null : "must start with mailto:"),
      optional: true,
    },

    {
      kind: "ask",
      key: "PAYMOB_INTEGRATION_IDS",
      group: "Payments (leave blank while mock)",
      targets: T,
      what: "comma-separated Paymob integration ids this deployment settles for (card, mobile wallet)",
      where: "Paymob dashboard — blank is correct until the account exists",
      validate: (v) => (/^\d+(\s*,\s*\d+)*$/.test(v) ? null : "digits, comma-separated"),
      optional: true,
    },
    {
      kind: "fixed",
      key: "PAYMENTS_MODE",
      group: "Payments (leave blank while mock)",
      targets: T,
      value: "mock",
      what: "must be explicit — C1 refuses to boot otherwise",
    },

    {
      kind: "ask",
      key: "WHATSAPP_TOKEN",
      group: "WhatsApp (leave blank while mock)",
      targets: T,
      what: "Meta Cloud API token",
      where: "Meta developer console — blank is correct until a verified number exists",
      validate: minLen(40),
      optional: true,
    },
    {
      kind: "ask",
      key: "WHATSAPP_PHONE_ID",
      group: "WhatsApp (leave blank while mock)",
      targets: T,
      what: "phone number id",
      where: "Meta developer console",
      validate: digits,
      optional: true,
    },
    {
      kind: "fixed",
      key: "WHATSAPP_MODE",
      group: "WhatsApp (leave blank while mock)",
      targets: T,
      value: "mock",
      what: "",
    },
    {
      kind: "fixed",
      key: "WHATSAPP_API_VERSION",
      group: "WhatsApp (leave blank while mock)",
      targets: T,
      value: "v21.0",
      what: "",
    },

    {
      kind: "fixed",
      key: "NEXTAUTH_URL",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "",
    },
    {
      kind: "fixed",
      key: "APP_BASE_URL",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "claim and invite links land INSIDE the app, so this is the ERP host",
    },
    {
      kind: "fixed",
      key: "APP_ORIGIN",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "",
    },
    {
      kind: "fixed",
      key: "APP_INTERNAL_URL",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "",
    },
    {
      kind: "fixed",
      key: "NEXT_PUBLIC_APP_URL",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "",
    },
    {
      kind: "fixed",
      key: "ERP_BASE_URL",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "superadmin-only: where a view-as handoff is posted",
    },
    {
      kind: "fixed",
      key: "SUPERADMIN_BASE_URL",
      group: "URLs",
      targets: T,
      value: SA_URL,
      what: "ERP-only: where end-view-as returns the browser",
    },
    {
      kind: "fixed",
      key: "MARKETING_SITE_URL",
      group: "URLs",
      targets: T,
      value: WWW_URL,
      what: "",
    },
    {
      kind: "fixed",
      key: "NEXT_PUBLIC_APP_ORIGIN",
      group: "URLs",
      targets: T,
      value: ERP_URL,
      what: "www-only: without it every login CTA falls back to localhost",
    },
    {
      kind: "fixed",
      key: "NEXT_PUBLIC_SITE_URL",
      group: "URLs",
      targets: T,
      value: WWW_URL,
      what: "",
    },
    {
      kind: "ask",
      key: "NEXT_PUBLIC_REALTIME_URL",
      group: "URLs",
      targets: T,
      what: "the Railway realtime service's public URL",
      where: "Railway → service → Settings → Domains",
      validate: (v) =>
        v.startsWith("https://") ? null : "must be an https:// URL",
      optional: true,
    },
    {
      kind: "ask",
      key: "REALTIME_INTERNAL_URL",
      group: "URLs",
      targets: T,
      what: "same service, the URL the ERP calls it on",
      where: "Railway → service → Settings → Domains",
      validate: (v) =>
        v.startsWith("https://") ? null : "must be an https:// URL",
      optional: true,
    },
    {
      kind: "fixed",
      key: "REALTIME_PORT",
      group: "URLs",
      targets: T,
      value: "3005",
      what: "",
    },

    {
      kind: "fixed",
      key: "INVITE_CHANNELS",
      group: "Invites",
      targets: T,
      value: "email",
      what: "",
    },
    {
      kind: "fixed",
      key: "INVITE_TOKEN_TTL_HOURS",
      group: "Invites",
      targets: T,
      value: "168",
      what: "",
    },
    {
      kind: "fixed",
      key: "WALKIN_TOKEN_TTL_HOURS",
      group: "Invites",
      targets: T,
      value: "168",
      what: "",
    },
    {
      kind: "fixed",
      key: "GUARDIAN_EMAIL_GRACE_DAYS",
      group: "Invites",
      targets: T,
      value: "14",
      what: "",
    },
    {
      kind: "fixed",
      key: "GUARDIAN_REMINDER_EVERY_DAYS",
      group: "Invites",
      targets: T,
      value: "3",
      what: "",
    },
  ];
}

/* ────────────────────────────────────────────────────────────────────────────
 * Parked and platform-set keys (Ali, 2026-08-30).
 *
 * PARKED means: do not prompt, do not write, do not print as an outstanding
 * checklist item — but do keep saying it exists, because "it never got asked
 * for" and "it was decided against" look identical six weeks later. Any value
 * already sitting in an env file is left exactly where it is; this script has
 * never removed a key it did not write.
 *
 * Each one was checked against the code before parking, and none of them can
 * stop an app from booting:
 *   Cloudinary  getConfig() throws only when called, and isCloudinaryConfigured()
 *               guards every call site — uploads go dark, nothing else does.
 *   WhatsApp    whatsapp/types.ts defaults WHATSAPP_MODE to "mock";
 *               cloud-api-driver returns {ok:false} rather than throwing.
 *   Paymob      only the account-specific keys are parked. PAYMOB_HMAC_SECRET
 *               STAYS — mock-driver.ts throws without it in production (C1),
 *               because the mock gateway signs its own webhooks with it.
 * ──────────────────────────────────────────────────────────────────────────── */

const PARKED: Record<string, string> = {
  PAYMOB_INTEGRATION_IDS: "Paymob — no merchant account yet; PAYMENTS_MODE stays mock",
  WHATSAPP_TOKEN: "WhatsApp — no verified business number; WHATSAPP_MODE stays mock",
  WHATSAPP_PHONE_ID: "WhatsApp — same",
  CLOUDINARY_CLOUD_NAME: "Cloudinary — parked; existing values left in place and still work",
  CLOUDINARY_API_KEY: "Cloudinary — same",
  CLOUDINARY_API_SECRET: "Cloudinary — same",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "Cloudinary — same",
};

/** Set straight on the platform, so the checklist must not ask for it again. */
const SET_ON_PLATFORM: Record<string, string> = {
  REDIS_URL:
    "set directly in Vercel. Still REQUIRED in production — assertSharedRateLimitStore fails the boot without it",
};

/* ────────────────────────────────────────────────────────────────────────────
 * Terminal I/O — hidden by construction.
 * ──────────────────────────────────────────────────────────────────────────── */

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

/**
 * The terminal is put into raw mode ONCE and stays there for the whole run.
 *
 * Toggling it per prompt leaves a window between two prompts in which the tty's
 * line discipline echoes whatever is typed — measured, not theorised: a paste
 * that arrived a moment early showed up in the scrollback in plain text. Any
 * character that arrives with no prompt waiting is queued here instead, still
 * unechoed, and handed to the next prompt.
 */
class Term {
  private fd: number | null = null;
  private stream: ReadStream | null = null;
  private queue = "";
  private consumer: ((chunk: string) => void) | null = null;

  /** Arm the terminal before anything is printed, so no prompt can be answered
   *  while the line discipline is still echoing. */
  arm() {
    this.open();
  }

  private open(): ReadStream {
    if (this.stream) return this.stream;
    try {
      this.fd = openSync("/dev/tty", "r");
      this.stream = new ReadStream(this.fd);
    } catch {
      throw new Error(
        "setup-env: cannot open /dev/tty. This script must run in a real terminal —\n" +
          "it reads secrets with echo off, and there is deliberately no non-interactive\n" +
          "mode: a flag that takes a secret is a flag that writes it to shell history.",
      );
    }
    this.stream.setRawMode(true);
    this.stream.resume();
    this.stream.setEncoding("utf8");
    this.stream.on("data", (chunk: string) => {
      const clean = chunk.replace(ANSI, "");
      if (this.consumer) this.consumer(clean);
      else this.queue += clean;
    });
    return this.stream;
  }

  close() {
    if (!this.stream) return;
    try {
      this.stream.setRawMode(false);
      this.stream.pause();
    } catch {
      /* the terminal went away; nothing to restore */
    }
    if (this.fd !== null) closeSync(this.fd);
    this.fd = null;
    this.stream = null;
    this.queue = "";
  }

  read(opts: { echo: boolean }): Promise<string> {
    this.open();
    return new Promise((resolve, reject) => {
      let buf = "";
      const finish = (fn: () => void) => {
        this.consumer = null;
        process.stdout.write("\n");
        fn();
      };
      const feed = (chunk: string) => {
        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i]!;
          if (ch === "\r" || ch === "\n") {
            this.queue += chunk.slice(i + 1);
            return finish(() => resolve(buf));
          }
          if (ch === "\u0003") return finish(() => reject(new Error("__ABORT__")));
          if (ch === "\u0004") {
            if (buf === "") return finish(() => reject(new Error("__ABORT__")));
            continue;
          }
          if (ch === "\u007f" || ch === "\b") {
            if (buf.length && opts.echo) process.stdout.write("\b \b");
            buf = buf.slice(0, -1);
            continue;
          }
          if (ch === "\u0015") {
            if (opts.echo) process.stdout.write("\r\x1b[K");
            buf = "";
            continue;
          }
          if (ch < " ") continue;
          buf += ch;
          if (opts.echo) process.stdout.write(ch);
        }
      };
      this.consumer = feed;
      const queued = this.queue;
      this.queue = "";
      if (queued) feed(queued);
    });
  }
}

const term = new Term();

/** Hidden. Nothing is echoed — not the characters, not a placeholder. */
const askHidden = async (prompt: string) => {
  process.stdout.write(prompt);
  return (await term.read({ echo: false })).trim();
};

const askVisible = async (prompt: string) => {
  process.stdout.write(prompt);
  return (await term.read({ echo: true })).trim();
};

const confirm = async (prompt: string, dflt = false) => {
  const a = (
    await askVisible(`${prompt} ${dflt ? "[Y/n]" : "[y/N]"} `)
  ).toLowerCase();
  if (!a) return dflt;
  return a === "y" || a === "yes";
};

/** Salted per run: comparable within this run, meaningless outside it. */
const fingerprint = (v: string) =>
  createHash("sha256").update(RUN_SALT).update(v).digest("hex").slice(0, 8);

const report = (key: string, v: string, note = "") =>
  console.log(
    `    ${C.green("✓")} ${key.padEnd(30)} ${C.dim(
      `${v.length} chars · fp ${fingerprint(v)}`,
    )}${note ? " " + C.dim(note) : ""}`,
  );

/* ────────────────────────────────────────────────────────────────────────────
 * Git safety. Two independent checks, both must pass, before any write.
 * ──────────────────────────────────────────────────────────────────────────── */

function git(args: string[]) {
  return spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
}

function assertUntrackedAndIgnored(rel: string) {
  if (git(["ls-files", "--error-unmatch", "--", rel]).status === 0)
    throw new Error(
      `setup-env: REFUSING to write ${rel} — git tracks it. A secret written to a ` +
        `tracked file is one 'git add -A' away from being published.`,
    );
  if (git(["check-ignore", "-q", "--", rel]).status !== 0)
    throw new Error(
      `setup-env: REFUSING to write ${rel} — .gitignore does not cover it.\n` +
        `The repo's rule is \`.env*\`; if this path does not match, add it before rerunning.`,
    );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Env file read / write.
 * ──────────────────────────────────────────────────────────────────────────── */

function readEnv(abs: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!existsSync(abs)) return m;
  for (const line of readFileSync(abs, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    m.set(t.slice(0, i).trim(), t.slice(i + 1));
  }
  return m;
}

const HEADER = (title: string) =>
  [
    `# ${title}`,
    `#`,
    `# Written by scripts/setup-env.ts. Gitignored — never commit, never paste`,
    `# into a chat, an issue, or a support ticket.`,
    ``,
  ].join("\n");

function writeEnv(id: TargetId, updates: Map<string, string>) {
  if (updates.size === 0) return;
  const { file, title } = TARGETS[id];
  assertUntrackedAndIgnored(file);
  const abs = path.join(ROOT, file);
  mkdirSync(path.dirname(abs), { recursive: true });

  const existing = existsSync(abs) ? readFileSync(abs, "utf8") : HEADER(title);
  const lines = existing.split("\n");
  const pending = new Map(updates);

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    if (pending.has(key)) {
      lines[i] = `${key}=${pending.get(key)!}`;
      pending.delete(key);
    }
  }

  if (pending.size) {
    if (lines.at(-1)?.trim()) lines.push("");
    for (const [k, v] of pending) lines.push(`${k}=${v}`);
    lines.push("");
  }

  const tmp = `${abs}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, lines.join("\n").replace(/\n{3,}/g, "\n\n"), {
      mode: 0o600,
    });
    renameSync(tmp, abs);
  } catch (e) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw e;
  }
  console.log(`  ${C.cyan("→")} wrote ${updates.size} key(s) to ${file}`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * The Neon block — one owner string in, four values out.
 * ──────────────────────────────────────────────────────────────────────────── */

const directHost = (h: string) => h.replace(/^([^.]+)-pooler\./, "$1.");
const pooledHost = (h: string) =>
  h.includes("-pooler.") ? h : h.replace(/^([^.]+)\./, "$1-pooler.");

/** URL-safe by construction: this password is embedded in a connection string. */
const mintPassword = () => randomBytes(24).toString("base64url");
const mintSecret = (bytes = 32) => randomBytes(bytes).toString("base64");

function rebuild(owner: URL, user: string, pass: string, host: string) {
  const u = new URL(owner.toString());
  u.username = encodeURIComponent(user);
  u.password = encodeURIComponent(pass);
  u.host = host;
  if (!u.searchParams.has("sslmode")) u.searchParams.set("sslmode", "require");
  return u.toString();
}

async function neonBlock(
  envName: string,
  targets: { admin: TargetId[]; app: TargetId[]; appDirect?: TargetId[] },
  existingProbe: TargetId,
  rotate: Set<string>,
): Promise<Map<TargetId, Map<string, string>>> {
  const out = new Map<TargetId, Map<string, string>>();
  const put = (id: TargetId, k: string, v: string) => {
    if (!out.has(id)) out.set(id, new Map());
    out.get(id)!.set(k, v);
  };

  const current = readEnv(path.join(ROOT, TARGETS[existingProbe].file)).get(
    "DATABASE_URL",
  );
  if (current && !rotate.has("DATABASE_URL")) {
    let host = "(unparseable)";
    try {
      host = new URL(current).host;
    } catch {}
    console.log(
      `\n  ${C.yellow("!")} ${TARGETS[existingProbe].file} already points at ${C.bold(host)}`,
    );
    if (!(await confirm("    Replace it with a new Neon branch?", false))) {
      console.log(`    ${C.dim("kept — skipping the whole database block")}`);
      return out;
    }
  }

  console.log(
    `\n  ${C.bold("Neon owner connection string")} for the ${C.bold(envName)} branch.` +
      `\n  ${C.dim("Neon console → Branches → " + envName + " → Connect → role neondb_owner.")}` +
      `\n  ${C.dim("Paste it whole. Nothing is echoed; press Enter when done.")}`,
  );

  let owner: URL | null = null;
  while (!owner) {
    const raw = await askHidden("    neondb_owner URL: ");
    const bad = all(notPlaceholder, pgUrl)(raw);
    if (bad) {
      console.log(`    ${C.red("✗")} ${bad}`);
      continue;
    }
    owner = new URL(raw);
    if (owner.username !== "neondb_owner") {
      console.log(
        `    ${C.yellow("!")} the role in that string is "${owner.username}", not neondb_owner.`,
      );
      if (!(await confirm("      Use it anyway as the owner string?", false))) {
        owner = null;
        continue;
      }
    }
  }

  const dHost = directHost(owner.host);
  const pHost = pooledHost(owner.host);
  const appPass = mintPassword();

  // DIRECT_URL is the MIGRATION datasource (prisma.config.ts reads it), and
  // bootstrap-app-role.ts does `REVOKE CREATE ON SCHEMA public FROM edura_app`
  // — so the app role can never run a migration, by design. In the database
  // package DIRECT_URL is therefore the OWNER string, same as ADMIN_URL.
  // extensions/index.ts puts it plainly: "Migrations and bootstrap keep using
  // DIRECT_URL / ADMIN_URL — those must never appear in a serving environment."
  const OWNER_URL = rebuild(owner, owner.username, decodeURIComponent(owner.password), dHost);
  const APP_DIRECT = rebuild(owner, "edura_app", appPass, dHost);
  const APP_POOLED = rebuild(owner, "edura_app", appPass, pHost);

  for (const id of targets.admin) {
    put(id, "ADMIN_URL", OWNER_URL);
    put(id, "DIRECT_URL", OWNER_URL);
    put(id, "DATABASE_URL", APP_POOLED);
    put(id, "APP_ROLE_PASSWORD", appPass);
  }
  // Serving files get the app role only. No DIRECT_URL: nothing in the runtime
  // reads it (grep packages/database/src), and an owner string here is exactly
  // the leak the role guard exists to prevent.
  for (const id of targets.app) {
    put(id, "DATABASE_URL", APP_POOLED);
  }
  // The one exception: the production union feeds gen-vercel-env.py, which
  // emits DIRECT_URL to both Vercel projects. It gets the APP role's direct
  // string — unused there, but never the owner.
  for (const id of targets.appDirect ?? []) {
    put(id, "DIRECT_URL", APP_DIRECT);
    put(id, "DATABASE_URL", APP_POOLED);
  }

  console.log(`    ${C.dim(`endpoint  ${dHost}  (direct)`)}`);
  console.log(`    ${C.dim(`          ${pHost}  (pooled)`)}`);
  report("ADMIN_URL", OWNER_URL, "— owner; database package ONLY, never an app");
  report("DIRECT_URL", OWNER_URL, "— owner; the migration datasource");
  report("DATABASE_URL", APP_POOLED, "— edura_app @ pooled; what the apps serve on");
  report("APP_ROLE_PASSWORD", appPass, "— consumed by db:bootstrap-role");
  return out;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Driving one environment.
 * ──────────────────────────────────────────────────────────────────────────── */

type Plan = { env: string; items: Item[]; neon: Parameters<typeof neonBlock>[1]; probe: TargetId };

const PLANS: Record<string, Plan> = {
  dev: {
    env: "dev",
    items: devItems(),
    neon: { admin: ["db.dev"], app: ["erp.dev", "sa.dev", "rt.dev"] },
    probe: "db.dev",
  },
  test: {
    env: "test",
    items: testItems(),
    neon: { admin: ["db.test"], app: [] },
    probe: "db.test",
  },
  production: {
    env: "production",
    items: prodItems(),
    neon: { admin: ["db.prod"], app: [], appDirect: ["prod"] },
    probe: "db.prod",
  },
};

async function runEnvironment(name: string, rotate: Set<string>) {
  const plan = PLANS[name]!;
  console.log(
    `\n${"═".repeat(74)}\n  ${C.bold(name.toUpperCase())}\n${"═".repeat(74)}`,
  );

  const writes = new Map<TargetId, Map<string, string>>();
  const merge = (m: Map<TargetId, Map<string, string>>) => {
    for (const [id, kv] of m) {
      if (!writes.has(id)) writes.set(id, new Map());
      for (const [k, v] of kv) writes.get(id)!.set(k, v);
    }
  };

  merge(await neonBlock(name, plan.neon, plan.probe, rotate));

  // Existing values, per target, so "already set" is honoured per file.
  const onDisk = new Map<TargetId, Map<string, string>>();
  const disk = (id: TargetId) => {
    if (!onDisk.has(id))
      onDisk.set(id, readEnv(path.join(ROOT, TARGETS[id].file)));
    return onDisk.get(id)!;
  };
  const isSet = (id: TargetId, k: string) => {
    const v = disk(id).get(k) ?? writes.get(id)?.get(k);
    return v !== undefined && v !== "" && v !== "REPLACE" && v !== "REPLACE_ME";
  };

  let group = "";
  const parked: string[] = [];
  for (const item of plan.items) {
    if (PARKED[item.key] || SET_ON_PLATFORM[item.key]) {
      parked.push(item.key);
      continue;
    }
    const needed = item.targets.filter(
      (t) => rotate.has(item.key) || !isSet(t, item.key),
    );
    if (needed.length === 0) continue;

    if (item.group !== group) {
      group = item.group;
      console.log(`\n  ${C.bold(group)}`);
    }

    let value: string | null = null;

    if (item.kind === "fixed") {
      value = item.value;
    } else if (item.kind === "mint") {
      value = mintSecret(item.bytes ?? 32);
    } else {
      console.log(`\n    ${C.bold(item.key)}${item.optional ? C.dim(" (optional — Enter to skip)") : ""}`);
      console.log(`    ${C.dim(item.what)}`);
      console.log(`    ${C.dim("where: " + item.where)}`);
      while (value === null) {
        const raw = await askHidden("    value: ");
        if (!raw) {
          if (item.optional) break;
          console.log(`    ${C.red("✗")} required`);
          continue;
        }
        const bad = all(notPlaceholder, item.validate)(raw);
        if (bad) {
          console.log(`    ${C.red("✗")} ${bad}`);
          continue;
        }
        value = raw;
      }
      if (value === null) {
        console.log(`    ${C.dim("skipped — key left blank")}`);
        value = "";
      }
    }

    for (const t of needed) {
      if (!writes.has(t)) writes.set(t, new Map());
      writes.get(t)!.set(item.key, value);
    }

    if (item.kind === "fixed")
      console.log(
        `    ${C.green("✓")} ${item.key.padEnd(30)} ${C.dim(item.value === "" ? "(empty, deliberately)" : item.value)}${item.what ? C.dim("  — " + item.what) : ""}`,
      );
    else if (value) report(item.key, value, item.kind === "mint" ? "— minted" : "");
  }

  if (parked.length) {
    console.log(`\n  ${C.dim("not asked for — parked or set on the platform:")}`);
    for (const k of [...new Set(parked)])
      console.log(
        `    ${C.dim("·")} ${k.padEnd(32)} ${C.dim(PARKED[k] ?? SET_ON_PLATFORM[k]!)}`,
      );
  }

  console.log("");
  for (const [id, kv] of writes) writeEnv(id, kv);
  return writes;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Audit: an owner credential must never sit in a serving app's env file.
 * ──────────────────────────────────────────────────────────────────────────── */

function auditAdminUrlLeaks() {
  const serving: TargetId[] = ["erp.dev", "sa.dev", "rt.dev", "www.dev"];
  const hits = serving.filter((id) =>
    readEnv(path.join(ROOT, TARGETS[id].file)).has("ADMIN_URL"),
  );
  if (!hits.length) return;
  console.log(
    `\n${C.yellow("⚠  ADMIN_URL is present in a serving app's env file:")}\n` +
      hits.map((h) => `     ${TARGETS[h].file}`).join("\n") +
      `\n   No app reads it — only packages/database/scripts/* do — and it is the\n` +
      `   BYPASSRLS owner credential. Delete those lines by hand; this script does\n` +
      `   not remove keys it did not write.`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * .env.example generation — the templates this repo never had.
 * ──────────────────────────────────────────────────────────────────────────── */

function writeExamples() {
  const byTarget = new Map<TargetId, Item[]>();
  for (const item of [...devItems(), ...testItems(), ...prodItems()])
    for (const t of item.targets) {
      if (!byTarget.has(t)) byTarget.set(t, []);
      byTarget.get(t)!.push(item);
    }
  const dbKeys = ["ADMIN_URL", "DIRECT_URL", "DATABASE_URL", "APP_ROLE_PASSWORD"];

  for (const [id, items] of byTarget) {
    const { file, title } = TARGETS[id];
    const out = [
      `# ${title}`,
      `#`,
      `# Template. Copy to ${path.basename(file)} and fill it with:`,
      `#   bun scripts/setup-env.ts`,
      `# Never put a real value in this file — it is the ONE .env* the repo tracks.`,
      ``,
      `# --- Database`,
      ...dbKeys.map((k) => `${k}=`),
      ``,
    ];
    let g = "";
    for (const it of items) {
      if (it.group !== g) {
        g = it.group;
        out.push(`# --- ${g}`);
      }
      if (it.kind === "fixed") out.push(`${it.key}=${it.value}`);
      else out.push(`${it.key}=`);
    }
    out.push("");
    const abs = path.join(ROOT, file + ".example");
    writeFileSync(abs, out.join("\n"));
    console.log(`  wrote ${file}.example`);
  }
  console.log(
    `\n  ${C.dim("`.gitignore` un-ignores `.env.example` — these are meant to be committed.")}`,
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The deploy checklist — names only, never values.
 * ──────────────────────────────────────────────────────────────────────────── */

const VERCEL_ERP = [
  ["Public URLs", ["NEXTAUTH_URL", "APP_BASE_URL", "NEXT_PUBLIC_APP_URL", "MARKETING_SITE_URL", "SUPERADMIN_BASE_URL"]],
  ["Secrets (no fallback in production)", ["NEXTAUTH_SECRET", "STUDENT_QR_SECRET", "VIEW_AS_SECRET", "REALTIME_JWT_SECRET", "INTERNAL_API_SECRET", "CRON_SECRET"]],
  ["Database — role edura_app, NEVER neondb_owner", ["DATABASE_URL", "DIRECT_URL", "DATABASE_DRIVER", "DATABASE_POOL_MAX"]],
  ["Payments", ["PAYMENTS_MODE", "PAYMOB_HMAC_SECRET", "PAYMOB_INTEGRATION_IDS"]],
  ["Mail", ["MAIL_PROVIDER", "MAIL_FROM", "MAIL_REPLY_TO", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]],
  ["Invites and guardian gate", ["INVITE_CHANNELS", "INVITE_TOKEN_TTL_HOURS", "WALKIN_TOKEN_TTL_HOURS", "GUARDIAN_EMAIL_GRACE_DAYS", "GUARDIAN_REMINDER_EVERY_DAYS"]],
  ["WhatsApp", ["WHATSAPP_MODE", "WHATSAPP_API_VERSION", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"]],
  ["Media", ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]],
  ["Realtime (the Railway service)", ["NEXT_PUBLIC_REALTIME_URL", "REALTIME_INTERNAL_URL"]],
  ["Web push", ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_SUBJECT"]],
  ["Observability — the build REFUSES production without this", ["NEXT_PUBLIC_SENTRY_DSN"]],
  ["Rate limiting — REDIS_URL is asserted at boot", ["REDIS_URL", "TRUSTED_PROXY_HOPS", "TRUSTED_CLIENT_IP_HEADER"]],
] as const;

const VERCEL_SA = [
  ["Public URLs — this app signs in at its OWN host", ["NEXTAUTH_URL", "APP_BASE_URL", "ERP_BASE_URL"]],
  ["Secrets", ["SUPERADMIN_NEXTAUTH_SECRET", "STUDENT_QR_SECRET", "VIEW_AS_SECRET", "INTERNAL_API_SECRET"]],
  ["Database", ["DATABASE_URL", "DIRECT_URL", "DATABASE_DRIVER", "DATABASE_POOL_MAX"]],
  ["Mail", ["MAIL_PROVIDER", "MAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS"]],
  ["Media", ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME"]],
  ["Observability", ["NEXT_PUBLIC_SENTRY_DSN"]],
  ["Rate limiting", ["REDIS_URL", "TRUSTED_PROXY_HOPS", "TRUSTED_CLIENT_IP_HEADER"]],
] as const;

const RAILWAY_RT = [
  ["The ERP it serves", ["APP_ORIGIN", "APP_INTERNAL_URL"]],
  ["Shared secrets — byte-identical to the ERP's", ["REALTIME_JWT_SECRET", "INTERNAL_API_SECRET"]],
  ["Database — DATABASE_DRIVER is pg here, not ws", ["DATABASE_URL", "DATABASE_DRIVER"]],
  ["Port", ["REALTIME_PORT"]],
] as const;

function checklist() {
  const seenParked = new Set<string>();
  const block = (
    title: string,
    where: string,
    groups: readonly (readonly [string, readonly string[]])[],
  ) => {
    console.log(`\n${C.bold(title)}\n${C.dim(where)}`);
    for (const [g, keys] of groups) {
      const active = keys.filter((k) => {
        if (PARKED[k] || SET_ON_PLATFORM[k]) {
          seenParked.add(k);
          return false;
        }
        return true;
      });
      if (!active.length) continue;
      console.log(`\n  ${g}`);
      for (const k of active) console.log(`    [ ] ${k}`);
    }
  };

  console.log(`\n${"═".repeat(74)}\n  ${C.bold("STILL TO SET BY HAND, ON THE PLATFORMS")}\n${"═".repeat(74)}`);
  console.log(
    C.dim(
      "\nNames only — this script never prints a value.\n" +
        "`python3 scripts/gen-vercel-env.py` splits .env.production into paste-ready\n" +
        "per-deployable files (.env-erp, .env-superadmin, .env-www for Vercel;\n" +
        ".env-api, .env-admin-api, .env-realtime for Railway).",
    ),
  );

  block("VERCEL — project: edura-erp", "Settings → Environment Variables → Production", VERCEL_ERP);
  block("VERCEL — project: edura-superadmin", "Settings → Environment Variables → Production", VERCEL_SA);
  block("VERCEL — project: edura-www", "Settings → Environment Variables → Production", [
    ["Where the login / register CTAs point", ["NEXT_PUBLIC_APP_ORIGIN"]],
    ["This site's canonical origin (optional)", ["NEXT_PUBLIC_SITE_URL"]],
  ]);
  block("RAILWAY — service: realtime", "Service → Variables", RAILWAY_RT);

  console.log(`\n${C.bold("GITHUB ACTIONS")}\n${C.dim("Settings → Secrets and variables → Actions")}`);
  console.log(`\n  Cron (inert until both exist — CRON_SECRET fails closed)`);
  for (const k of ["CRON_BASE_URL", "CRON_SECRET"]) console.log(`    [ ] ${k}`);
  console.log(`\n  Backups (the nightly schedule is disabled without these)`);
  for (const k of ["BACKUP_DIRECT_URL", "BACKUP_B2_KEY_ID", "BACKUP_B2_APP_KEY", "BACKUP_B2_BUCKET"])
    console.log(`    [ ] ${k}`);
  console.log(`\n  DB suites in CI (throwaway Postgres, labelled edura-env:test)`);
  for (const k of ["TEST_DATABASE_URL", "TEST_DIRECT_URL", "TEST_ADMIN_URL"])
    console.log(`    [ ] ${k}`);

  if (seenParked.size) {
    console.log(`\n${C.bold("NOT ON THE LIST, AND ON PURPOSE")}`);
    console.log(
      C.dim(
        "  Absent from the checkboxes above so they do not read as forgotten.\n" +
          "  Nothing here can stop an app from booting — each was checked against\n" +
          "  the code. Any value already in an env file was left in place.",
      ),
    );
    const platform = [...seenParked].filter((k) => SET_ON_PLATFORM[k]);
    const parked = [...seenParked].filter((k) => PARKED[k]);
    if (platform.length) {
      console.log(`\n  ${C.green("done — set on the platform directly")}`);
      for (const k of platform)
        console.log(`    ${C.green("[x]")} ${k.padEnd(32)} ${C.dim(SET_ON_PLATFORM[k]!)}`);
    }
    if (parked.length) {
      console.log(`\n  ${C.yellow("parked — revisit when the account exists")}`);
      for (const k of parked)
        console.log(`    ${C.dim("[-]")} ${k.padEnd(32)} ${C.dim(PARKED[k]!)}`);
    }
    console.log(
      C.dim(
        "\n  Still required and NOT parked: PAYMENTS_MODE, PAYMOB_HMAC_SECRET,\n" +
          "  WHATSAPP_MODE, WHATSAPP_API_VERSION. The mock payment driver signs its\n" +
          "  own webhooks with that secret, and C1 makes it throw in production\n" +
          "  without one — mock or not.",
      ),
    );
  }

  console.log(`\n${C.yellow("Three that a hand-copy reliably gets wrong:")}`);
  console.log(`  1. STUDENT_QR_SECRET and VIEW_AS_SECRET must be BYTE-IDENTICAL on erp and`);
  console.log(`     superadmin. A mismatch is indistinguishable from a forgery.`);
  console.log(`  2. NEXTAUTH_SECRET must NOT exist on superadmin — it uses`);
  console.log(`     SUPERADMIN_NEXTAUTH_SECRET, so one app's leak cannot mint the other's`);
  console.log(`     sessions.`);
  console.log(`  3. DATABASE_DRIVER is "pg" on Railway and "ws" on both Vercel projects.`);
  console.log(`\n  And: ADMIN_URL goes on NO platform. It is the owner credential.\n`);
}

/* ────────────────────────────────────────────────────────────────────────────
 * main
 * ──────────────────────────────────────────────────────────────────────────── */

async function main() {
  const argv = process.argv.slice(2);
  const flag = (n: string) => argv.includes(n);
  const val = (n: string) => {
    const i = argv.indexOf(n);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  if (argv.some((a) => a.includes("=") && !a.startsWith("--")))
    throw new Error(
      "setup-env: a KEY=VALUE argument was passed. Secrets are never taken from\n" +
        "argv — they would land in your shell history and in `ps` output. Run the\n" +
        "script with no arguments and answer the prompts.",
    );

  if (flag("--checklist")) return checklist();
  if (flag("--write-examples")) return writeExamples();

  const only = val("--only");
  const names = only ? [only] : ["dev", "test", "production"];
  for (const n of names)
    if (!PLANS[n]) throw new Error(`setup-env: unknown environment "${n}"`);

  const rotate = new Set((val("--rotate") ?? "").split(",").filter(Boolean));

  if (flag("--plan")) {
    for (const n of names) {
      const p = PLANS[n]!;
      console.log(`\n${C.bold(n.toUpperCase())}`);
      console.log(`  neon owner string → ADMIN_URL, DIRECT_URL, DATABASE_URL, APP_ROLE_PASSWORD`);
      console.log(`  files: ${[...new Set([...p.neon.admin, ...p.neon.app, ...p.items.flatMap((i) => i.targets)])].map((t) => TARGETS[t].file).join(", ")}`);
      const asks = p.items.filter((i) => i.kind === "ask");
      const mints = p.items.filter((i) => i.kind === "mint");
      console.log(`  ${asks.length} prompt(s): ${asks.map((i) => i.key).join(", ")}`);
      console.log(`  ${mints.length} minted:   ${mints.map((i) => i.key).join(", ")}`);
    }
    console.log("");
    return;
  }

  term.arm(); // raw mode ON before the first byte is printed — see Term above
  console.log(
    `\n  ${C.bold("Edura environment setup")}\n` +
      `  ${C.dim("Nothing you type is echoed, logged, or written to a tracked file.")}\n` +
      `  ${C.dim("Ctrl-C aborts; files already written stay written.")}`,
  );

  for (const n of names) await runEnvironment(n, rotate);

  auditAdminUrlLeaks();
  checklist();
}

main()
  .then(() => {
    term.close();
    process.exit(0);
  })
  .catch((e: unknown) => {
    term.close();
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "__ABORT__") {
      console.log("\n  aborted.\n");
      process.exit(130);
    }
    console.error(`\n${C.red(msg)}\n`);
    process.exit(1);
  });
