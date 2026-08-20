# Handover — the marketing imagery work, and what is left

Paste the block below into a fresh session. It is written to be self-contained:
the next session has none of this context.

---

## THE PROMPT

You are continuing work on **Edura** (`/Users/ali/edura`) — a Bun-only Turbo
monorepo, Next 16.3, React 19.2, TypeScript 7. Read `CLAUDE.md` at the repo root
first; it is binding.

### What was just finished

A six-phase pass that produced the complete visual record of `apps/erp` for the
marketing site `apps/www`, which previously shipped zero images and rendered 19
"reserved plate" blanks.

**Shipped and verified:**

| | |
|---|---|
| 21 stills wired into the site | `apps/www/public/system/*.webp` — 4320×2700 masters, 2.6 MB |
| 4 silent looping clips | `counter-board`, `settlement`, `walk-in`, `assistant-door` — MP4 + WebM + poster, 1.6 MB |
| 22 library stills, NOT wired | `apps/www/public/system/library/` + its `INDEX.md` |
| Capture harness | `apps/erp/tools/system-shots/` — see below |

**Gates, all green at handover:** `apps/www` → `check-types`, `lint`, `build`,
`verify` **84/84**, `capture` clean. `apps/erp` → `build` passes.

### The harness (all in `apps/erp/tools/system-shots/`)

- `playwright.config.ts` — drives an ALREADY-RUNNING dev server on :3002,
  `deviceScaleFactor: 3`, `channel: chrome`. Never starts its own server.
- `assets.spec.ts` — the 19 curated slots from `apps/www/docs/ASSETS.md`
- `library.spec.ts` — the 22 library screens
- `clips.spec.ts` + `render-clips.sh` — records and encodes the four clips
- `probe.spec.ts` → `probe.json` — walks every route, records tabs/health
- `optimise.sh` — encodes PNG → WebP at `-q 92 -sharp_yuv`, NO downscaling
- `build-forbidden.ts` → `forbidden.json` — generates the "must never appear in
  an image" list FROM THE DATABASE (97 terms from 39 non-demo accounts)
- `cleanup-walkins.ts` — deletes the shell students the walk-in clip creates
- `INVENTORY.md` — every route, every tab, what each screen is worth shooting

Run captures with:
```
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright test \
  --config=tools/system-shots/playwright.config.ts -g "capture"   # or "library" / "clip"
tools/system-shots/optimise.sh
```

### THE NEXT STEP — the only real blocker

**Set the Vercel production env vars for the three projects.** I could not: the
CLI is logged in as `aliabdelhadi`, whose only scope is `aliabdelhadis-projects`,
and the Edura projects live under team `team_BDAW0E3OXzaVf3SjGk2qdhzC` which that
account cannot see. Ali needs to grant access or log in as the owner first.

Values to set (then **redeploy** — Vercel bakes env at build time):

```
ERP project          NEXTAUTH_URL     = https://edura-erp.vercel.app
                     APP_BASE_URL     = https://edura-erp.vercel.app
                     APP_ORIGIN       = https://edura-erp.vercel.app
                     APP_INTERNAL_URL = https://edura-erp.vercel.app

superadmin project   NEXTAUTH_URL     = https://edura-superadmin.vercel.app
                     APP_BASE_URL     = https://edura-superadmin.vercel.app

www project          none of these — it has no DB, no auth, no session
```

**CONFIRM THE PROJECT NAMES WITH ALI BEFORE WRITING ANYTHING.** There is a real
contradiction: `apps/erp/.vercel/project.json` says the linked project is named
**`edura-www`**, not `edura-erp` — a leftover from the folder rename, when the
directory called `www` WAS the ERP. Setting env on the wrong project is silent
and damaging. Also all three `*.vercel.app` hostnames returned 404 when checked,
so confirm what is actually deployed where.

**Why this matters more than it looks:** a duplicate `appBaseUrl()` in
`services/invites/invite-token.ts` used to ignore `APP_BASE_URL` entirely. That
was fixed this session, so from the next deploy every invite/claim link WILL use
whatever the dashboard says. If it still says `app.edura.eg`, every invite goes
out with a dead link.

### Hard rules

1. **`app.edura.eg` is NOT in use.** Ali does not use it, it has no DNS. Never
   put it in code, config or docs. The live hosts are the Vercel ones.
2. **Never run `git add` / `commit` / `push`**, and never add a `Co-Authored-By`
   or any trailer. Provide commit message text only; Ali runs all git commands.
3. **No real person may appear in any captured image.** The check is generated,
   not hand-typed — re-run `build-forbidden.ts` if the database changes. There
   are TWO real people in the dev DB, not one.
4. **Money demo data goes through the real engine**, never a direct INSERT. See
   `settled-lessons-demo-seed.ts` and `showcase-payments-demo-seed.ts` — both
   POST to the app's own endpoints.
5. `apps/www/src` is largely **untracked**, and `apps/www` in `HEAD` is the OLD
   ERP. `git checkout -- apps/www` would destroy the landing site. Never suggest
   it as a revert.

### Environment

- ERP dev on **:3002**, www on **:3010**, superadmin :3004, realtime :3005.
  Start them with `preview_start` using `.claude/launch.json` names
  (`edura-erp`, `edura-www`, `edura-realtime`) — never `bash` a dev server.
- All app `.env` files are **symlinks to one root `.env`**. Editing the root
  fixes all four.
- Demo accounts, password `Passw0rd!`:
  `showcasedemo-marwan@edura.test` (center owner, the rich fixture),
  `showcasedemo-hossam@edura.test` (teacher, `counter_and_door`),
  `showcasedemo-nour@edura.test` (assistant), `showcasedemo-tarek@edura.test`
  (staff manager), `paydemo.sami@edura.demo` (parent, 2 children),
  `showcasedemo-student-1@edura.test` (student),
  `counterdemo-hoda@edura.test` (counter demo center).
- **Two seeds are clock-dependent and must be re-run before any capture:**
  ```
  bun run --filter @repo/database seed:counter-demo
  bun --env-file=.env --cwd packages/database prisma/showcase-live-demo-seed.ts
  ```

### Traps already paid for — each cost hours

- **The login form discards anything typed before hydration.** Fill, then read
  the value back and refill. Every spec does this.
- **Removing React-owned DOM nodes** (e.g. the sonner toaster) throws on the
  next reconciliation and unmounts the subtree. Hide with CSS instead.
- **`tsc` with its incremental cache reported 5 of 8 errors.** Diagnose with
  `--incremental false` or you are debugging on partial information.
- **`ReturnType<typeof useTranslations>`** resolves to the narrowest overload and
  rejects every valid key. Use a scoped translator type.
- **Lists fetch behind spinners that carry no `animate-pulse`.** Poll for real
  rows, or you photograph a loading circle.
- **`GET /api/v1/sessions?to=YYYY-MM-DD` drops that day's lessons** if they are
  stored at noon — `new Date("...")` is midnight. Fixtures must store `T00:00Z`.
- Next's dev badge intercepts clicks; every spec injects
  `nextjs-portal { display: none !important; }`.

### Open items, in priority order

1. **Vercel env vars** — blocked on access. See above.
2. **WhatsApp is off.** `INVITE_CHANNELS` defaults to `email`, so walk-in
   registration returns `whatsapp: "skipped"` and the counter hands the claim
   link over in person. Set `INVITE_CHANNELS=email,whatsapp` if the WhatsApp
   flow should run — then the walk-in clip is worth re-recording.
3. **Dev residue that cannot be undone:** 4 payments / 8 transactions at the
   counter-demo center, written by clip takes through the real money engine.
   The ledger is append-only by DB grant; only `bun run db:wipe dev --yes`
   removes them.
4. **`apps/www` has three unwired clip slots' siblings** — the library's 22
   stills are deliberately not in `src/media/manifest.ts`. Promoting one is a
   one-line manifest edit.
5. **A new `apps/www` section** needs two lines in `src/app/[locale]/page.tsx`
   and, if it is a new route, an entry in `src/lib/routes.ts` — `verify` asserts
   every rendered href is in the sitemap.

### Product defects found by capturing, already fixed this session

Recorded so nobody re-reports them: the external-teachers gaps screen printed
raw debug payloads including a student UUID; the center audit log printed raw
English enums; and the duplicate `appBaseUrl()` described above. All three now
have regression assertions in `library.spec.ts`.

### Still-open product observations (not fixed, not mine to fix)

- `GET /api/v1/teacher/attendance-mode` returns **403 to an assistant**, though
  CLAUDE.md decision #9 puts attendance mode inside the delegation grant.
- `/dashboard/parent/pay`'s «كل المواد» tab is **inert** — neither a click nor
  `?scope=all` switches it, and no `[role="tabpanel"]` exists.
- `/dashboard/student/courses` and `/subjects` render the same heading and tabs.
- A receptionist hitting a manager-only staff route gets a **permanent loading
  shell**, not a refusal.
- The collaboration-request status renders the raw English enum `pending`.
