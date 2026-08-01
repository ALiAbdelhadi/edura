# Runbook — Error tracking (Sentry) & product analytics (PostHog)

Both are **off unless configured**. No DSN → no Sentry. No PostHog key → no
analytics. Local development and CI therefore send nothing without anyone
having to remember to disable them.

---

## 1. The privacy boundary — read this first

Everything either vendor is allowed to see is decided in **one** dependency-free
package: `packages/observability`. It is imported from browser bundles, Node
handlers and the edge runtime alike, so two apps × three runtimes × two vendors
cannot drift apart on it.

### Rule 1 — IDs only

`observabilityIdentity()` returns at most `{ id, role, centerId }`. Never a name,
email, phone, address, or anything a human typed. A UUID is enough to correlate
an error with a support ticket; a name in a vendor's search index is a
disclosure that cannot be withdrawn.

### Rule 2 — minors are never identified

`isMinorRole()` treats **every `student`** as a minor. This is deliberately
*stricter* than the chat gate (`chat-minors.ts`), which reads the verified
date-of-birth columns and does let a verified adult student through.

Analytics does not get that lookup, for two reasons: it would put a birth-date
read on the page-view path, and stricter is the right direction for a third
party. The cost is that a handful of verified-adult students are analysed
anonymously. That is the correct trade.

**A student generates no funnel events at all** — see §3.

### Rule 3 — what is switched off on purpose

| Off | Why |
|---|---|
| Sentry **session replay** | Records the DOM: a minor's name, their grades, a guardian's email — replayable by anyone with a Sentry login. |
| PostHog **session recording** | Same, and explicitly out of scope. |
| PostHog **autocapture** | Captures the *text* of clicked elements. On a roster screen that is a list of children's names. |
| `sendDefaultPii` | Would attach IP addresses. |
| Request bodies / cookies / headers in Sentry | Can contain a password being set or a guardian's email. Deleted in `beforeSend`, not merely un-requested. |

### Rule 4 — tokens never leave the process

Invite-claim, walk-in onboarding, password-reset and student-onboarding links all
carry a **live single-use token in the query string**. A URL captured verbatim
into an error report is a credential sitting in a third party's database.

`redactUrl` / `redactText` / `redactDeep` strip them from URLs, messages,
breadcrumbs and nested payloads — along with emails and Egyptian phone numbers.
If scrubbing itself throws, `beforeSend` returns `null` and **drops the event**:
losing an error report is strictly better than shipping an unscrubbed one.

Proofs: `apps/www/tests/unit/observability.test.ts` (26 tests).

---

## 2. Sentry

### Setup

1. Create two projects: `edura-www` and `edura-superadmin` (Next.js platform).
2. Set the env vars below.
3. For source maps, create an auth token with `project:releases` scope.

| Variable | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | Both apps, all envs | The only thing needed to switch Sentry ON. |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | Both | `production` / `preview`. Defaults to `NODE_ENV`. |
| `NEXT_PUBLIC_SENTRY_RELEASE` | Both, optional | Commit SHA. Makes "when did this start?" answerable. |
| `SENTRY_TRACES_SAMPLE_RATE` | Both, optional | Default `0.1` in production, `0` elsewhere. |
| `SENTRY_ORG` / `SENTRY_PROJECT` | CI | Source-map upload. |
| `SENTRY_PROJECT_SUPERADMIN` | CI, optional | Falls back to `SENTRY_PROJECT`. |
| `SENTRY_AUTH_TOKEN` | **CI only** | Its presence is what enables map upload. |

**Errors are always captured at 100%.** `SENTRY_TRACES_SAMPLE_RATE` only samples
*performance traces* — 10% by default because this is a single-country K-12
platform, and 100% tracing burns the quota in the week you actually need it.

### Source maps

Uploaded only when `SENTRY_AUTH_TOKEN` is set, and **deleted after upload**
(`deleteSourcemapsAfterUpload`). A publicly-served source map is a free copy of
the whole server-side codebase, which here includes the money engine. A local
`bun run build` needs no credentials and uploads nothing.

### Where the wiring lives

| File | Runtime |
|---|---|
| `instrumentation.ts` | Node + edge loader; **`onRequestError`** |
| `instrumentation-client.ts` | Browser |
| `sentry.server.config.ts` / `sentry.edge.config.ts` | Per-runtime `init` |
| `src/app/global-error.tsx` | Root-layout crashes |
| `src/app/[locale]/error.tsx` | Route-level crashes |
| `src/lib/observability/sentry-user.ts` | Scope tagging |

`onRequestError` is the load-bearing one: errors thrown inside Server Components
and route handlers are caught by Next before any global handler sees them, so
without it most server errors are simply never reported.

Tagging happens inside `getSessionUser()` — the single session surface — so
every route is tagged without remembering to, and a signed-out request
**clears** the scope rather than inheriting the previous user on a reused
serverless instance.

### CSP

Both apps allow `https://*.ingest.sentry.io` and `https://*.ingest.de.sentry.io`
in `connect-src`. This was added while the CSP is still **Report-Only** on
purpose: the report only means something if legitimate traffic is allowed, and
on the day it flips to enforce, error reporting must not go dark.

Sentry is deliberately **not** tunnelled through our own origin: an error tracker
has to keep working when this server is unhealthy, which is exactly when a
self-hosted tunnel would be down too.

---

## 3. PostHog

**www only.** The back office is internal staff tooling; there is no product
funnel to measure there.

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_POSTHOG_KEY` | The only thing needed to switch analytics ON. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Default `https://eu.i.posthog.com`. **Use the EU region.** |

### The funnel

```
landing_cta_clicked → signup_completed → first_teacher_added
                                       → first_group_created
                                       → first_student_added
                                       → first_payment_completed
```

This is the **center/teacher activation** journey. Every actor in it is an adult
running a business; a student appears only as the *object* of "first student
added", never as a tracked subject. That is why Rule 2 costs the funnel nothing.

Event names are a closed set in `@repo/observability/events`. PostHog would
happily accept `signup_completed`, `signup-completed` and `signupCompleted` as
three unrelated events and split the funnel three ways with no error anywhere.

**"First" is computed, not assumed.** Each `first_*` helper counts the rows and
fires only when the count is exactly 1 — the row it just created. A funnel where
step 3 has more events than step 2 is worse than no funnel.

Properties go through an **allowlist** (`sanitizeProperties`), so a careless
`{ ...user }` spread cannot put a name into the warehouse.

### Where the events fire

| Event | Site |
|---|---|
| `landing_cta_clicked` | `trackLandingCta()` — call from marketing CTAs *(not yet attached; see post-merge notes)* |
| `signup_completed` | `api/v1/auth/register/{center,teacher}` |
| `first_teacher_added` | `collaboration-requests/[id]/accept` — on **acceptance**, not request |
| `first_group_created` | `api/v1/courses` POST |
| `first_student_added` | `api/v1/enrollments` POST |
| `first_payment_completed` | Paymob webhook **and** the wallet-paid subscription path |

The funnel helpers live in `@repo/server-core/services/analytics` rather than in
`apps/www`, specifically so the wallet and cash money rails — which live in the
kernel — can report the same event. A helper in `apps/www` could only ever see
the gateway rail, and "first payment" that ignores wallet payments would
under-report activation with no way to notice.

### The `/ingest` proxy

PostHog is reverse-proxied through our own origin (`next.config.ts` rewrites).
`*.i.posthog.com` is on every major ad-blocker list, so direct ingest silently
loses a large slice of Egyptian traffic and the funnel under-reports with no
error to see. Same-origin also keeps `connect-src 'self'` sufficient.

---

## 4. Verifying it works

Neither vendor is configured yet, so the first deploy with keys should be
checked:

1. **Sentry** — visit any page, then in a browser console
   `throw new Error("sentry smoke test")`. The issue should appear within a
   minute, with `user_role` / `center_id` tags and **no** email or name.
2. **Server-side Sentry** — hit a route that throws; confirm it arrives via
   `onRequestError` (issues from Server Components carry a `nextjs` mechanism).
3. **Scrubbing** — trigger an error on a URL with `?token=abc` and confirm the
   captured URL shows `token=REDACTED`.
4. **PostHog** — register a test center; `signup_completed` should appear with
   `role: center_admin` and no personal fields.
5. **Minor rule** — sign in as a student and confirm **no** `identify` call and
   no person profile is created (pageviews only).
