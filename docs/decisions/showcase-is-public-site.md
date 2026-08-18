# The showcase is the public site; www is the app (built 2026-08-10 — awaiting review)

Two deployments, two domains, one direction of travel: `apps/showcase` is the
marketing site at the apex, `apps/www` is the product at `app.` — which is what
`APP_BASE_URL` was already pinned to on 2026-08-09.

1. **www NO LONGER HAS A LANDING PAGE.** `apps/www/src/features/landing/
   landing-screen.tsx` was DELETED and `/{locale}` is now a redirect. Two
   landing pages under one brand is how they drift, and the showcase already
   owned the better one.
2. **THE SESSION CHECK SURVIVED THE DELETION, and it is the whole point of the
   file.** The old page checked for a session before rendering and sent a
   signed-in user to their dashboard. That ordering is KEPT and asserted: a
   user who has already converted must never be bounced out to the sales site.
   `tests/unit/root-redirect.test.ts` **9/9** proves all four branches.
3. **THE REDIRECT IS TEMPORARY (307), NOT PERMANENT (308) — deliberately.** A
   308 is cached hard by browsers, so a wrong or not-yet-live destination
   becomes very difficult to walk back, and the marketing DNS is still
   settling. Once the domain is stable this should become `permanentRedirect`,
   which is what actually tells search engines the homepage has moved.
4. **NEVER A DEAD LINK.** With `MARKETING_SITE_URL` unset the root falls back to
   `/{locale}/login` — the app's own front door — rather than redirecting to
   nothing. `marketingSiteUrl()` also refuses a non-http(s) scheme, because that
   string becomes a `Location` header.
5. **www STILL OWNS THE OTHER PUBLIC PAGES, and the showcase depends on it.**
   The showcase's header and footer link INTO www for login, register, pricing,
   help, faq, contact, changelog, privacy and terms. Deleting www's marketing
   surface would break the showcase's own navigation — only the landing page
   was duplicated.
6. **The `home` row was removed from `MARKETING_LINKS`**, so www's sitemap no
   longer lists `/{locale}`. The showcase lists it at priority 1 in its own
   sitemap; two priority-1 entries for the same content under one brand points
   search engines at the copy that is only a hop. The header logo still links
   to `/`, so the way home is unchanged for a reader — it just resolves
   off-site now. The existing "puts every navigable page in the sitemap"
   invariant therefore still holds unedited.
7. **`landing.module.css` is NOT dead and was NOT deleted** — `LandingShell`
   still applies `.landing`, and that shell wraps every remaining marketing
   page. Only the deleted screen's own rules (~220 lines) were pruned.

**No database migration, no schema change, no API change.**

Proofs: `tests/unit/root-redirect.test.ts` **9/9**, www unit **673 pass / 1
skip** (60 files), root `check-types` clean, `bun run build` green for www and
showcase, and www's built `sitemap.xml` verified to carry 40 URLs with no root
entry. Verified live in the browser: `localhost:3052/ar` (www, production build)
lands on `localhost:3006/ar` (the showcase). **NOTE: `curl` is NOT a valid check
here** — with `Accept: */*` Next answers an external redirect with a 200 RSC
payload, so only a real document request shows the hop.

**[production Vercel, DEPLOYED 2026-08-10]** New project **`edura-showcase`**
(`prj_COrhzJzIz1AubA9E2HJQiBgnD9EW`, root `apps/showcase`, git-linked to
`ALiAbdelhadi/edura` on `main`) is LIVE at **https://edura-showcase.vercel.app**
— all five role pages 200, robots and sitemap emitting the real origin, zero
`localhost` in the HTML, and every CTA resolving to `https://edura-www.vercel.app`.

- **The first deploy FAILED and the reason is worth keeping:** Vercel auto-detects
  Turbo and runs `turbo run build`, which dies with `env: 'node': No such file or
  directory` (exit 127) on this Bun-only repo. www and superadmin only avoid it
  because their `vercel.json` sets an explicit `buildCommand`. The showcase's
  `vercel.json` was not yet committed, so `buildCommand`/`installCommand` were set
  as PROJECT SETTINGS instead (`bun run build` / `bun install`). When the file
  lands, `vercel.json` takes precedence — both say the same thing, so no conflict.
- **`*.vercel.app` was chosen over the custom domains deliberately.** `edura.eg`
  and `app.edura.eg` still have no DNS, and a redirect or CTA pointing at a
  domain that does not resolve is worse than one that does. When DNS lands:
  attach the domains, then update `NEXT_PUBLIC_APP_ORIGIN` and
  `MARKETING_SITE_URL`. `NEXT_PUBLIC_SITE_URL` can then be DELETED rather than
  edited — it falls back to `VERCEL_PROJECT_PRODUCTION_URL`, which auto-upgrades.
  It is set explicitly today only because the committed code predates that
  fallback and would otherwise emit localhost canonicals.
- **WHAT IS DEPLOYED IS `main` (ac5e941), NOT the working tree.** The deployment
  was triggered from the git ref so that the ~357 uncommitted files — including a
  concurrent workstream's in-flight work — could not be published. Consequence:
  the round-2 role-pages redesign and the URL-resolution fixes are NOT live yet
  (the trust figure reads 7, not 9 — that is the tell). They ship on the next
  push to `main`, which auto-deploys.
- **`MARKETING_SITE_URL` is set on `edura-www` but does NOTHING yet**, for two
  independent reasons: the redirect code is uncommitted, and Vercel binds env at
  deploy time. www's root still serves the old landing page until `main` moves.

### Env vars added (both OPTIONAL, both fail soft)
- `MARKETING_SITE_URL` (www) — the showcase's origin. Unset ⇒ the root goes to
  `/login` instead. **Set this in production or the marketing site is orphaned.**
- `NEXT_PUBLIC_APP_ORIGIN` (showcase) — the app's origin, where its login and
  register CTAs point. Unset ⇒ they resolve to `localhost:3002` and are dead for
  every visitor, so the build WARNS loudly. It warns rather than throws because
  CI runs `bun run build` with no deployment env.
- `NEXT_PUBLIC_SITE_URL` (showcase) — its own public origin. Usually unnecessary:
  it falls back to `VERCEL_PROJECT_PRODUCTION_URL`, so attaching the real domain
  to the project fixes every canonical, hreflang and sitemap URL with no config.
  Before this, both showcase URLs fell back to localhost — the same bug that once
  made www serve `<link rel="canonical" href="http://localhost:3002/…">`.
