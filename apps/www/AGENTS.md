# AGENTS.md — EduPlatform

## Overview

EduPlatform is a **Next.js 14 App Router** backend + React frontend for tutoring centers in Egypt. The tech stack is:

- **Runtime**: Node.js ≥20, pnpm. 
<!-- there is a new verizon  -->
- **Framework**: Next.js 14.2 (App Router, TypeScript)
- **Database**: MongoDB via Mongoose 8.x
- **Auth**: next-auth 4.x, Credentials provider, JWT sessions
- **Validation**: Zod 3.x
- **Password hashing**: bcryptjs (cost 10)
- **Money**: Stored as signed integer **minor units** (piastres = 1/100 EGP). Never use floats.
- **Email**: Stubbed to console log in dev; configured via `MAIL_PROVIDER=console|mailgun|sendgrid`
- **File storage**: Cloudinary (planned, not yet wired)
- **Push**: FCM deferred to post-launch

---

## Project Structure

```
/app
  /api/v1/*              Route handlers = the API surface
  /layout.tsx             Root layout
  /page.tsx               Frontend entry (massive, being refactored)
  /globals.css
/components/ui/           Extracted reusable UI components
/lib
  /db
    connect.ts            Mongoose singleton (global cache for hot-reload)
    models/               Mongoose models — one file per collection
  /auth
    options.ts            next-auth config + Credentials provider
    session.ts            getSessionUser() / requireSession() helpers
  /authz
    requireRole.ts        Role guard — throws ForbiddenError
    requireCenterScope.ts  Center tenancy guard — throws ForbiddenError
  /services/              Business logic (thin routes, fat services)
    /auth/                Registration, password reset, invite accept
    /users/               Me-related services
  /errors
    classes.ts            Typed error classes
    http.ts               AppError → NextResponse mapper + withErrors()
  /http
    envelope.ts           ok() / fail() response helpers
  /validation
    zod.ts               parseOrThrow() / parseJson()
    common.ts            Shared Zod schemas (password, email, phone, name, locale)
  /constants/
    subjects.ts           Curated subject list seed data
  /utils/
    random.ts            Family code generator, center shortId generator
  /mail/
    send.ts              Email sender (console | mailgun | sendgrid)
/docs/                   Full product spec + backend plan + epic prompts
```

---

## Essential Commands

```bash
pnpm dev          # Start dev server on :3000
pnpm build        # Production build
pnpm start        # Start production server on :3000
pnpm lint         # next lint
pnpm typecheck    # tsc --noEmit
pnpm seed         # tsx scripts/seed.ts — seed subjects + dev fixtures
```

> **MongoDB requirement**: Local dev needs a replica set (`mongod --replSet`) or Atlas (which supports transactions natively). Transactions are used in center registration.

---

## Architecture Conventions

### Route Handler Pattern

Every route handler follows this exact pattern:

```typescript
import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";

export const dynamic = "force-dynamic";

export const GET = withErrors(async (req, ctx) => {
  // 1. Auth guard
  const user = await requireSession();

  // 2. Role guard (if needed)
  await requireRole("center_admin");

  // 3. Parse input
  const input = await parseJson(req, someSchema);

  // 4. Call service
  const result = await someService(input, user);

  // 5. Respond
  return ok(result);
});
```

The `withErrors` wrapper catches all `AppError` subclasses and maps them to the correct HTTP response. Handlers never wrap in try/catch.

### Response Envelope

```json
{ "data": { ... } }                    // 200/201 success
{ "data": { ... }, "meta": { ... } }   // with pagination meta
{ "error": { "code": "...", "message": "..." } }     // always
{ "error": { "code": "...", "message": "...", "fields": {...} } } // validation
```

### Error Codes

| HTTP | code | When |
|------|------|------|
| 400 | `validation_error` | Zod parse failure, `fields` map included |
| 401 | `unauthenticated` | No session |
| 403 | `forbidden` | Role denied or center scope mismatch |
| 404 | `not_found` | Resource missing |
| 409 | `conflict` | Duplicate, shell collision |
| 410 | `expired` | Token/request expired |
| 422 | `business_rule` | Rule violation (blacklisted, at capacity, etc.) |
| 500 | `internal` | Unexpected error |

### Authorization

Two guards applied at handler entry (in order):

1. `requireRole(...allowedRoles)` — from `lib/authz/requireRole.ts`
2. `requireCenterScope(user, resourceCenterId)` — from `lib/authz/requireCenterScope.ts`, only meaningful for `center_admin` role

The session object carries: `id`, `role`, `centerId?` (admins only), `locale`.

### Session Object (plumbed through JWT callbacks)

```typescript
type SessionUser = {
  id: string;
  role: "student" | "parent" | "teacher" | "center_admin";
  centerId?: string;  // only for center_admin
  locale: "ar" | "en";
  name?: string | null;
  email?: string | null;
};
```

---

## Naming Conventions

- **Model files**: `PascalCase.ts` (e.g., `CenterAdminProfile.ts`), exported as named export `export const CenterAdminProfile`
- **Route handlers**: `route.ts` per segment (Next.js convention)
- **Service files**: `camelCase.ts`, one file per logical operation
- **Roles**: lowercase strings: `student`, `parent`, `teacher`, `center_admin`
- **User statuses**: `active`, `shell`, `suspended`, `deleted`
- **Model collections**: lowercase plural (Mongoose default: `users`, `centers`, `reviews`)

---

## Database Patterns

### Mongoose Singleton (Hot-Reload Safe)

```typescript
// lib/db/connect.ts
// Uses global._mongoose cache so connection persists across Next.js hot reloads
export async function connectDB(): Promise<typeof mongoose>
```

Every service/handler calls `connectDB()` at entry. No lazy global — call it explicitly.

### Model Definition

Models use the `models.X || model()` pattern for hot-reload safety:

```typescript
export const User: Model<UserDoc> =
  (models.User as Model<UserDoc>) || model<UserDoc>("User", userSchema);
```

### Lean Queries

Prefer `.lean()` for read-only queries. Results are plain objects, not Mongoose documents.

### Transactions

Used for multi-document writes (center registration). Requires replica set. Pattern:

```typescript
const session = await mongoose.startSession();
try {
  await session.withTransaction(async () => {
    // all writes inside
  });
} finally {
  await session.endSession();
}
```

---

## Frontend Notes

- Frontend entry at `app/page.tsx` — a thin shell (~250 lines) that imports screen components from `components/screens/`.
- Screen components live in `components/screens/`: 15 screens (4 dashboards, 11 role-specific), all using Tailwind CSS v4.
- Shared UI primitives in `components/screens/ui.tsx`: `Icon`, `Avatar`, `Badge`, `ProgressBar`.
- Mock data in `lib/mockData.ts`: `ROLES`, `TWEAK_DEFAULTS`, and role-specific data arrays.
- Design tokens defined in `app/globals.css` via `@theme {}` (Tailwind v4): colors, spacing, border radius.
- Next.js layouts are not yet wired — navigation between roles is in-page switching with localStorage persistence.
- Tweaks panel supports accent color, sidebar width, and showAvatars via postMessage protocol.

---

## Validation Patterns

All Zod schemas defined in `lib/validation/common.ts` or co-located with the route. Key schemas:

- `emailSchema` — lowercases + trims automatically
- `passwordSchema` — min 8, requires letter + digit
- `phoneSchema` — validated with regex
- `nameSchema` — trimmed, 1–120 chars
- `localeSchema` — `z.enum(["ar", "en"])` optional

Validation errors from `parseJson` / `parseOrThrow` return 400 with a `fields` map (keyed by Zod path, value is array of messages).

---

## Gotchas

1. **MongoDB replica set required for local dev**: Transactions are used in `registerCenter`. Without a replica set, the transaction will throw. Use Atlas or `mongod --replSet rs0`.

2. **Shell account collision**: If a student self-registers with an email that has a pending shell (from a center's pre-create invite), the registration **claims the shell** (keeps the original `_id` so roster/enrollment links survive). Handled in `registerStudent` / `registerParent` — see the `claimableShell()` flow.

3. **next-auth session token keys**: `jwt` callback sets `token.uid`, `token.role`, `token.centerId`, `token.locale`. The `session` callback reads them back and writes to `session.user`. Always go through this chain — the `id` field on the session user comes from `token.uid`, not `user.id`.

4. **Phone uniqueness is a sparse partial unique index**: Only indexed when `phone` is a string (not null). The phone field on users is not required for all roles.

5. **`startTime`/`endTime` stored as `"HH:mm"` strings**: Lexicographic string comparison is safe for time comparison in `HH:mm` format (zero-padded). Don't parse to Date for comparison.

6. **`export const dynamic = "force-dynamic"`** on every route: Required because MongoDB connections are per-request in dev mode. Without it, Next.js may cache the response incorrectly.

7. **`withErrors` is mandatory**: It maps `AppError` subclasses to HTTP responses. Without it, errors propagate as 500. Every handler wraps with it.

8. **No cross-center data access**: Every admin/teacher query must be scoped by `centerId`. There is no filter here — missing scope silently returns wrong data. `requireCenterScope` guards against write operations; reads need explicit filtering.

9. **`MAIL_PROVIDER=console` logs to stdout**: Emails are printed to the console in dev. Set to `mailgun` or `sendgrid` in production (credentials go in env).

10. **Money as integers only**: All prices and payments are signed integers in piastres. The `payments.amount` field uses this — never float, never cents.

11. **`teacherProfiles.ratingAvg` is denormalized**: Updated on every review write (create/edit/delete). It's a plain number, not a method — recalculate it when writing reviews.

12. **Attendance 7-day edit window**: Records become locked after 7 days from the session date. `locked` field is set server-side on read when the window has passed — check `locked` before allowing edits.

13. **Pending enrollment request expiry**: Lazy expiry on read (14 days). No cron. When reading a request older than 14 days, flip it to `expired` before returning. Don't fire notifications on silent expiry.

14. **Shell status for pre-created accounts**: `status=shell`, `passwordHash=null`. Activated via `POST /auth/invite/accept` which sets the password and flips to `active`. The `_id` is preserved — no new user is created.

15. **Default locale is Arabic (`ar`)**: All users default to `ar` unless they specify otherwise during registration. The frontend supports RTL.

---

## Source Documents

Three files in `/docs` are the authoritative references for this codebase:

- **`EduPlatform_Spec_v2.md`** — Product behavior: features, business rules, data model, authority matrix, what's in/out of scope for V1.
- **`EduPlatform_Backend_Plan_v1.md`** — Backend design: architecture, data model detail, cross-cutting specs (auth, authz, notifications, error envelope), full REST API map, epic breakdown.
- **`EduPlatform_Epic_Prompts.md`** — Per-epic implementation prompts with acceptance criteria. Feed one at a time.

When behavior described here conflicts with what you find in code, the **code wins** — the spec and plan documents are the design intent, not the source of truth.
