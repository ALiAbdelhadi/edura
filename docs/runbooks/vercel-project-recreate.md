# Runbook — recreating the Vercel projects from scratch

**Written 2026-08-19.** The three Vercel projects were deleted; all of
`edura-erp.vercel.app`, `edura-www.vercel.app` and `edura-superadmin.vercel.app`
return `x-vercel-error: DEPLOYMENT_NOT_FOUND`. This is the sheet for standing
them back up.

Read `CLAUDE.md` first — it is binding. Two lines in it are now **stale** and are
corrected here:

- «THE LIVE HOSTS ARE THE VERCEL ONES» (2026-08-19) — nothing is deployed at any
  of them right now.
- `STUDENT_QR_SECRET` «set on BOTH edura-www and edura-superadmin» (2026-08-09) —
  that value died with the projects. It is **not** in `.env.production`; it must
  be generated fresh.

`app.edura.eg` is NOT in use and must not appear in any value below.

---

## 0. The env files are already written

Four files sit at the repo root, one per app, generated from `.env.production`
and gitignored:

| File | Where it goes |
|---|---|
| `.env-erp` | Vercel — the ERP project |
| `.env-superadmin` | Vercel — the back office |
| `.env-www` | Vercel — the marketing site |
| `.env-realtime` | **Railway**, not Vercel |

Vercel's project settings take a pasted `.env`, so each file goes in whole. Do
not paste `.env.production` itself into anything: it is the union of all four
apps' keys, and every extra secret on a project is a secret that project can
leak.

**Only `SMTP_PASS` is still unfilled** (a Google app password — see §3).

Three secrets were GENERATED rather than copied, because this system mints them
itself rather than receiving them from anyone:

- `STUDENT_QR_SECRET` — signs every student ID card's QR. `qrSecret()`
  (`packages/server-core/src/services/students/student-qr.ts:91`) throws in
  production when unset, deliberately with no fallback: a card signed with a
  guessable value is forgeable, and nobody finds out until someone is marked
  present at a lesson they never attended. **The ERP's and the superadmin's must
  be IDENTICAL** — a card printed in the back office has to verify at a counter —
  and the generated files already satisfy that. Rotating it invalidates every
  printed card at once; reissue is per-student and is the intended tool.
- `VIEW_AS_SECRET` — signs the back-office "view as" handoff token
  (`packages/server-core/src/auth/view-as-token.ts`). Same posture and same
  hazard as `STUDENT_QR_SECRET`: **the ERP's and the superadmin's must be
  IDENTICAL**, because superadmin signs the token and the ERP verifies it, and
  a mismatch looks exactly like a forgery. It throws in production when unset.
  Rotating it invalidates only tokens in flight — they live sixty seconds — so
  rotation is cheap here, unlike the QR secret.
- `PAYMOB_HMAC_SECRET` — required in production even under `PAYMENTS_MODE=mock`
  (`mock-driver.ts:20`), because the mock driver signs its own webhooks with it
  and a public signing key would let anyone forge a settlement. Any random value
  is correct until a real Paymob account exists; swap in Paymob's when
  `PAYMENTS_MODE` stops being `mock`.

Both were written back into `.env.production`, so they survive this session.

### Regenerating the files

`.env.production` is the source. After editing it, re-run the generator to
refresh all four — it reuses any secret already present and only mints what is
missing, so re-running is safe and does not rotate anything.

```bash
python3 scripts/gen-vercel-env.py
```

### Three things the generator got right that a hand-copy gets wrong

- `APP_ORIGIN` and `APP_INTERNAL_URL` are **not** ERP variables. Only
  `apps/realtime/src/env.ts` reads them; they belong on Railway. An earlier
  handover listed all four URLs under the ERP project.
- `MARKETING_SITE_URL` is an ERP variable nobody had listed, and it was unset.
  It is the mirror of www's `NEXT_PUBLIC_APP_ORIGIN`: without it the ERP's
  signed-out root has nowhere to redirect to.
- **`NEXTAUTH_SECRET` must NOT go on the superadmin project.**
  `apps/superadmin/src/lib/auth/auth.ts:48` treats it as a dev-only fallback and
  production must use `SUPERADMIN_NEXTAUTH_SECRET`. Setting both would hand the
  back office the secret that mints ERP sessions, collapsing the M2 boundary.

---

## 1. The three projects

| Project | Root Directory | Framework | Build Command |
|---|---|---|---|
| ERP (the product) | `apps/erp` | Next.js | from `apps/erp/vercel.json` — leave Vercel's override **off** |
| superadmin (back office) | `apps/superadmin` | Next.js | from `apps/superadmin/vercel.json` — override **off** |
| www (marketing site) | `apps/www` | Next.js | **must be set by hand** (see below) |

Install Command for all three: `bun install`.

### The build command trap

Vercel auto-detects Turbo at the repo root and runs `turbo run build`, which
dies on this Bun-only repo with `env: 'node'` not found, exit 127. Every project
therefore needs an explicit build command.

`apps/erp` and `apps/superadmin` already carry theirs in their own `vercel.json`:

```
bun run --filter @repo/database generate && bun run build
```

`apps/www` has **no** `vercel.json`. Either set the Build Command in the
dashboard to `bun run build`, or add the file. It needs no Prisma generate — it
has no database.

### Re-linking

`apps/erp/.vercel/project.json` and `apps/superadmin/.vercel/project.json` point
at the deleted project ids and are now dead. `.vercel` is gitignored, so just
delete both directories and run `vercel link` in each app folder once the new
projects exist. Note the ERP's old file recorded its project name as
`edura-www` — a leftover from when the directory called `www` WAS the ERP. Pick
whatever name you like for the new one; nothing in the repo depends on it.

---

## 2. Environment variables

**The tables below are the reasoning; `.env-*` from §0 is what you paste.** They
are kept because a table says *why* a variable is on a project, which a generated
file cannot, and because the next person to add a variable needs to know which
project owns it.

Vercel bakes env at build time: **every change needs a redeploy to take effect.**

### ERP project

| Variable | Value |
|---|---|
| `NEXTAUTH_URL` | the ERP's own production URL |
| `APP_BASE_URL` | same |
| `APP_ORIGIN` | same |
| `APP_INTERNAL_URL` | same |
| `NEXTAUTH_SECRET` | from `.env.production` |
| `STUDENT_QR_SECRET` | **newly generated in step 0** |
| `VIEW_AS_SECRET` | **newly generated** — signs the back-office "view as" handoff. Must be IDENTICAL to the superadmin's: that app signs, this one verifies, and a mismatch is indistinguishable from a forged token. Required in prod, no fallback |
| `SUPERADMIN_BASE_URL` | the superadmin's production URL — where "end view-as" sends the browser back to |
| `REALTIME_JWT_SECRET` | from `.env.production` — required in prod, no fallback |
| `INTERNAL_API_SECRET` | from `.env.production` — required in prod, no fallback |
| `CRON_SECRET` | from `.env.production` — the endpoint fails closed without it |
| `DATABASE_URL` | production Neon, role `edura_app` (NOT `neondb_owner`) |
| `DIRECT_URL` / `ADMIN_URL` | production Neon owner strings |
| `DATABASE_DRIVER` | `ws` |
| `DATABASE_POOL_MAX` | `10` |
| `PAYMENTS_MODE` | must be explicit: `mock` \| `sandbox` \| `live` |
| `PAYMOB_HMAC_SECRET` | required in prod, no fallback — even in `mock` |
| `PAYMOB_API_KEY`, `PAYMOB_INTEGRATION_ID_CARD`, `PAYMOB_INTEGRATION_ID_WALLET` | from `.env.production` |
| `MAIL_PROVIDER`, `MAIL_FROM`, `SMTP_*` | see the mail warning below |
| `INVITE_CHANNELS` | `email` (see the mail warning) |
| `INVITE_TOKEN_TTL_HOURS`, `WALKIN_TOKEN_TTL_HOURS` | `168` |
| `GUARDIAN_EMAIL_GRACE_DAYS`, `GUARDIAN_REMINDER_EVERY_DAYS` | `14`, `3` |
| `WHATSAPP_MODE` | `mock` |
| `CLOUDINARY_*` + `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | from `.env.production` |
| `NEXT_PUBLIC_REALTIME_URL`, `REALTIME_INTERNAL_URL` | the Railway realtime URL |
| `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_SUBJECT` | web push |
| `REDIS_URL` | Upstash, for the shared rate limiter |
| `TRUSTED_PROXY_HOPS` | `1` |

`SEED_*` are for seeding scripts, not the running app — leave them off Vercel.

### superadmin project

| Variable | Value |
|---|---|
| `NEXTAUTH_URL` | the **superadmin's own** production URL — it signs in at its own host, so this must override the shared `.env.production` value |
| `APP_BASE_URL` | same |
| `SUPERADMIN_NEXTAUTH_SECRET` | its own signing secret, deliberately different from the ERP's |
| `STUDENT_QR_SECRET` | **identical to the ERP's** |
| `VIEW_AS_SECRET` | **identical to the ERP's** |
| `ERP_BASE_URL` | the **ERP's** production URL. Its own variable because `APP_BASE_URL` here is overridden to this app's host (row above), so every generic resolver would answer "the back office" and post the handoff to a route that only exists in the other app. Required in prod — it throws rather than misdirecting a credential |
| `DATABASE_URL`, `DIRECT_URL`, `ADMIN_URL`, `DATABASE_DRIVER`, `DATABASE_POOL_MAX` | same as ERP |
| `INTERNAL_API_SECRET` | same as ERP |
| `CLOUDINARY_*` | same as ERP |
| `REDIS_URL`, `TRUSTED_PROXY_HOPS` | same as ERP |

### www project

It has no database, no auth and no session — but it is **not** env-free:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_ORIGIN` | **the ERP's production URL.** Every login/register CTA on the marketing site resolves through it. Unset, `appOrigin()` (`apps/www/src/lib/app-origin.ts:16`) warns at build and falls back to `http://localhost:3002` — dead links for every visitor. |
| `NEXT_PUBLIC_SITE_URL` | optional. `siteOrigin()` falls back to Vercel's own `VERCEL_PROJECT_PRODUCTION_URL`, so only pin this once a final domain exists. |

---

## 3. Two things that are broken independently of the deploy

**Mail — configured 2026-08-19, one value outstanding.** `.env.production` now
carries `MAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
`SMTP_SECURE=true` and `SMTP_USER=thisisaliabdelhadi@gmail.com`. Only
`SMTP_PASS` is still the literal `REPLACE` — a Google **app password**, which
requires 2FA on the account and can only be generated by Ali at
<https://myaccount.google.com/apppasswords>.

Proven by running `mail-check` against `.env.production`: the connection reached
`smtp.gmail.com` over TLS on 465 and Gmail rejected the placeholder with
`535-5.7.8 Username and Password not accepted`. Host, port, TLS and user are
therefore correct; the password is the only gap. `mail-check` prints
`SMTP_PASS = (set)` for ANY non-empty value, so it reads as configured while it
is not — trust the verification result, never that line.

Until the password lands, `INVITE_CHANNELS=email` with `WHATSAPP_MODE=mock`
means **no invite, claim link, guardian verification or welcome email reaches
anyone.** That gates a real product function, not just convenience: a MINOR
whose guardian never receives the verification email keeps adult-facing
messaging LOCKED.

**The Gmail ceiling, recorded deliberately.** 500 messages/day, and Gmail
rewrites `From` to the authenticated account. Gmail was chosen over a relay
because `MAIL_FROM` already pointed at it and `normalizeSmtpPass`
(`packages/notifications/src/transport/smtp.ts:38`) exists specifically to
handle Google's 4x4 app-password format — but it is a launch-scale answer, not a
permanent one. Moving to a real relay (Brevo, Zoho) is an env change, never a
code change: `sendMail` works with any SMTP host.

Set the same `MAIL_*` / `SMTP_*` values on the ERP Vercel project.

The two commands:

```bash
python3 -c 'import getpass,io,re,sys;f=".env.production";pw=re.sub(r"\s+","",getpass.getpass("Gmail app password: "));s=io.open(f,encoding="utf-8").read();p=re.compile(r"^SMTP_PASS=.*$",re.M);sys.exit("no SMTP_PASS line") if not p.search(s) else None;io.open(f,"w",encoding="utf-8").write(p.sub("SMTP_PASS="+pw,s,count=1));print("SMTP_PASS set (%d chars)"%len(pw))'
```

```bash
bun --env-file=.env.production apps/erp/scripts/mail-check.ts you@example.com
```

`mail-check` touches no database, so pointing it at `.env.production` is safe
and tests exactly what production will use. Note `apps/erp`'s own `mail:check`
script reads `.env.local`, which does not exist in this repo — use the command
above instead.

**A fixed bug makes `APP_BASE_URL` matter more than it used to.** A duplicate
`appBaseUrl()` in `services/invites/invite-token.ts` read `NEXTAUTH_URL` and fell
back to `http://localhost:3002`, ignoring `APP_BASE_URL` entirely. That was fixed
on 2026-08-19, so from the next deploy every invite and claim link WILL use
whatever the dashboard says. A wrong value here now reaches real users.

---

## 4. After the first deploy

```bash
bun --env-file=.env.production packages/database/scripts/verify-db.ts
```

Read-only and safe against any target. Expect 27/27 and 53 migrations. The
database was never touched by the project deletion — only the hosting was.

Then probe the login door with deliberately invalid credentials: a **401** is
correct, a **500** means the code is running against schema it does not have —
the exact shape of the 2026-08-02 outage.
