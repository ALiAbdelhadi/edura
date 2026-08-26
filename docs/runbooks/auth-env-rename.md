# Runbook — retiring the `NEXTAUTH_*` env names

next-auth the **package** was removed with the better-auth migration: no
dependency, no import, no file. What survived is its **vocabulary** — the env
vars better-auth is still handed are named after a library this codebase no
longer contains.

The migration introduced zero new env vars on purpose, so that no deployment had
to change on the day the code did. That was right then. This is how it ends.

## Why this is not a find-and-replace

The values are not in the repo. They are in:

| Where | Vars |
|---|---|
| Vercel — `edura-www` (production + preview) | `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| Vercel — `edura-superadmin` | `SUPERADMIN_NEXTAUTH_SECRET`, `NEXTAUTH_URL` |
| Railway — `apps/realtime` | `NEXTAUTH_SECRET` (dev fallback for `REALTIME_JWT_SECRET`) |
| GitHub Actions | set inline in `ci.yml` |
| Local | `.env`, `.env.production`, three `.env.test` files |

Code that reads only `BETTER_AUTH_SECRET`, shipped to a deployment still holding
`NEXTAUTH_SECRET`, hands better-auth `secret: undefined`. It cannot verify a
single existing session and cannot mint a new one: **every user is signed out and
no one can sign back in.** A cosmetic rename becomes a total auth outage — the
same shape as the 2026-08-01 incident, where code shipped ahead of the
environment it needed.

So the code accepts **both**, new name preferred
(`packages/server-core/src/auth/auth-env.ts`). Every read in every app goes
through it; `grep -rn "process.env.NEXTAUTH" apps/*/src packages/*/src` returns
nothing. Deploy order does not matter, and nothing breaks while the estate is
half-migrated.

## The cutover

1. **Add the new names alongside the old ones.** Do not remove anything yet.

   > `scripts/add-better-auth-env-to-vercel.sh` used to do this in one shot; it
   > was retired in the 2026-08-26 cleanup — it targeted the Vercel projects
   > deleted on 2026-08-19. The estate still runs on the OLD names (the
   > `.env-*` sheets from `scripts/gen-vercel-env.py` carry `NEXTAUTH_*`,
   > which the code accepts). To perform this cutover now: add the new names
   > via the dashboard or `vercel env add`, or extend gen-vercel-env.py's
   > per-app allowlists with the new keys.

   | Old | New |
   |---|---|
   | `NEXTAUTH_SECRET` | `BETTER_AUTH_SECRET` |
   | `NEXTAUTH_URL` | `BETTER_AUTH_URL` |
   | `SUPERADMIN_NEXTAUTH_SECRET` | `SUPERADMIN_BETTER_AUTH_SECRET` |

   **Copy the values verbatim.** A new secret is not a rename — it invalidates
   every live session, which is the outage you are avoiding. Keep the back
   office's secret DIFFERENT from www's; that separation is deliberate (M2), so
   a leak of one cannot mint the other's sessions.

   > **Copy from VERCEL, not from `.env.production`.** The script does, and the
   > reason is concrete: `.env.production` holds
   > `NEXTAUTH_URL=https://app.edura.eg`, a domain that does not resolve
   > (checked 2026-08-03 — the connection fails; the custom domain is still
   > outstanding). Production serves from `edura-www.vercel.app`, whose live
   > sign-in door answers `401 USER_NOT_FOUND` rather than `403 INVALID_ORIGIN`,
   > so Vercel is NOT holding the local file's value. Since the code prefers the
   > new name, copying the local one would move `baseURL` — and `trustedOrigins`
   > with it — onto a dead domain and fail every sign-in.

   Railway needs nothing: `apps/realtime` never reads an auth secret in
   production (`dedicatedSecret()` returns `REALTIME_JWT_SECRET` on its first
   line and throws before the fallback; that path is dev-only).

2. **Deploy.** The new names now win; the old ones sit unused.

3. **Confirm nothing is still falling back.** `usingLegacyAuthEnvNames()` is
   exported for exactly this. A fallback nobody can see is a fallback nobody
   removes.

4. **Only then remove the old vars** from Vercel, Railway, `ci.yml` and the
   local `.env` files.

5. **Delete the fallback**: reduce `auth-env.ts` to the `BETTER_AUTH_*` reads,
   drop the legacy cases from `apps/www/tests/unit/auth-env-names.test.ts`, and
   delete this runbook. Its whole purpose is to stop existing.

## What is deliberately NOT renamed

- **Cookie names** (`edura.session_token`, `edura-superadmin.session_token`)
  already carry no next-auth branding, and renaming a cookie signs everyone out.
- **The `/api/auth/*` route base.** It is better-auth's own `basePath`, not a
  next-auth relic.
- **Historical prose** in `docs/security/security-audit.md`,
  `docs/architecture/better-auth-migration-audit.md` and similar. Those describe
  what was true when written. Rewriting history to match the present is how a
  record stops being one.
