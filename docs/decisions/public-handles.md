# Public handles — one name per centre or teacher, on a path today and a subdomain tomorrow

Built 2026-09-09. Awaiting review.

## What was asked

"Something like a subdomain" for every centre and every teacher: `elmaged.edura.com`,
`ahmed-elshennawy.edura.com`. The product is on `*.vercel.app`, which cannot carry a
wildcard, and `edura.com` (or whichever root Ali registers) does not exist yet — so
the question was whether the foundation could be built now, without the domain.

It can, because a subdomain is only ever a **routing key**: one wildcard DNS record
and one wildcard certificate cover every tenant, and the thing that has to exist per
tenant is a row in our own database. That row, the page it resolves to, and the
resolver at the edge are this change. The DNS is one record on the day the domain
is bought.

## What was built

**One table, one namespace.** `public_handles` (migration 80,
`20260911120000_public_handles`) holds BOTH kinds — `kind ∈ {center, teacher}`, an
owner column for each, and a plain `UNIQUE` on `handle`. Two columns
(`centers.slug` + `teacher_profiles.slug`) could each be unique and still let a
centre and a teacher resolve to the same hostname; one table is the only way to say
"never" at the database. Two CHECKs Prisma cannot model live in the migration and
`apps/erp/tests/db/public-handles.test.ts` asserts them by attempting the write:

- `public_handles_one_owner` — exactly one owner column set, and it agrees with `kind`;
- `public_handles_shape` — the DNS-label shape, `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`
  with no `--`. A row that is not a valid hostname label cannot exist whoever wrote it.

**`prisma migrate dev` WILL offer to drop both. Refuse.**

**The rules live once, in `handle-rules.ts`**, and run in three places: the settings
card (so the owner sees the reason before the round trip), the API (the gate), and
the host resolver at the edge. The reserved list (`www`, `api`, `admin`, `superadmin`,
`app`, `erp`, `login`, `edura`, …) lives only there — it changes with the platform's
own hostnames, not with the data.

**Ownership comes from the session, never from the body.** `PUT /api/v1/me/public-handle`
names the caller's OWN centre (`center_admin`) or OWN profile (`teacher`). Assistants
and centre staff are refused: the handle is the tenant's public name, closer to the
login email than to a roster edit, and neither delegation grants identity. A clash
surfaces as the UNIQUE violation → `ConflictError { reason: "taken" }`; there is no
read-then-write.

**The page: `/[locale]/p/[handle]`.** Server-rendered, session-less, reads through
`resolvePublicProfile`, which applies a **status gate** — a centre that is not
`active`, or a teacher whose user is not `active`, is a 404, not an empty page — and
**never selects `courses.online_url`**, the paid credential from
[course-delivery-and-teacher-day](course-delivery-and-teacher-day.md). The centre
half of that read is the SAME function `GET /api/v1/centers/[id]` now runs, which
also closes a gap: that route used to return pending and suspended centres.
`/c/[…]` was already taken by the student-card QR page, hence `/p/`.

**The edge resolver is dormant until `PUBLIC_ROOT_DOMAIN` is set.** With it set
(e.g. `edura.com`), `src/proxy.ts` treats `<label>.<root>` as a tenant host and
serves ONE thing: the root (and its bare locale) rewrites to `/[locale]/p/<label>`;
**every other path is a 307 to the canonical host**. That is what keeps auth on one
origin — no login form, no session cookie and no API call ever lives on a tenant
subdomain, so `trustedOrigins` and the cookie domain stay exactly as they are. Proven
without DNS by `apps/erp/tests/unit/tenant-host-proxy.test.ts`.

**The sitemap lists only handles that pass the gate**, so it never advertises a 404.

## The page's design

Recorded here rather than in a scratch file, because a later change to this page
needs the decisions, not a re-derivation of them.

**The repo's own system won, and no aesthetic skill was loaded.** "Classical Ledger"
already exists in `packages/ui/src/styles/globals.css` and
`apps/erp/src/components/ledger/`, and a design system in the repo outranks any
outside direction. So the page is built from the primitives the rest of the product
uses — `Eyebrow`, `Chip`, `InitialsTile`, `LedgerTable`, `LedgerButton`, `Container`,
`MarketingFooter` inside `LandingShell` — and introduces no new component vocabulary.

| | value | where it comes from |
|---|---|---|
| Ground / sheet / field | `#f3f2f2` / `#faf9f9` / `#eae9e9` | `--paper` / `--sheet` / `--field` |
| Ink | `#201f1d`, `#605d5d`, `#6b6867` | `--ink`, `--ink-2`, `--ink-3` |
| Accent | `#1a2f73` on `#eaecf6` | `--indigo`, `--indigo-soft` |
| Seat states | `#0a7a6f` / `#a35a06` / `#a81d1d` | `--teal`, `--amber`, `--red` |
| Type | IBM Plex Sans Arabic (Arabic + Latin), IBM Plex Mono for figures | root layout, `Num` |

Every colour is a token, so dark mode came for free — the dark block at
`globals.css:122` re-points the same names, and the page was checked in both.

**The one deliberate risk: the tenant's name is the hero, and Edura is small.** The
name is set in the marketing `pageTitle` scale; the platform is a 22px mark plus a
footer line. A page a teacher sends over WhatsApp has to look like *theirs*, not like
a directory row. The counterweight is that every action still leaves for the
canonical host.

**Arabic is the default, so RTL is the layout, not an afterthought.** `dir="auto"`
is on the SHORT values that may arrive in either script — a course title, a subject,
a teacher's name, an address — and deliberately NOT on the prose blocks (the name
heading, the "about" paragraph, the qualifications), where a Latin first word would
flip a whole paragraph away from the page's direction.

**No motion.** A static marketing surface with one job; the only transitions are the
hover colours `LedgerButton` already carries.

Checked at 375px, at desktop width, in light and dark, and in both locales.

## What was deliberately NOT done

- **Login on the subdomain.** Rejected: a `.edura.com` cookie domain plus a wildcard
  `trustedOrigins` would hand every tenant page the session cookie of anyone who
  visits it — including a `super_admin` on view-as. The URL is the whole benefit; the
  cost is the session model this product is built on.
- **Arabic handles.** IDN labels transliterate badly and punycode is unreadable in a
  WhatsApp message; `suggestHandle` yields "" for an Arabic-only name and the owner
  types a Latin one.
- **Handle history / redirects from old names.** A rename releases the old name at
  once (E2 in the suite). Cheap to add later as a second table; not needed to launch.
- **Per-tenant theming, gallery, map, reviews list, on-page subscribe.** The CTA hands
  the visitor to `/register` on the canonical host; subscribing stays inside the app.

## The day the domain exists

1. Buy the root. Point its nameservers at Vercel DNS (a wildcard certificate needs
   the DNS-01 challenge; with another registrar it is a TXT record every renewal).
2. Add `*.<root>` to the ERP project. Check the plan — wildcard domains have been a
   Pro-tier feature.
3. Set `PUBLIC_ROOT_DOMAIN=<root>` on the ERP project and redeploy. Nothing else
   changes; the settings card starts showing the subdomain form of the link.

## Environment state

**[test (local), 2026-09-09]** migration 80 applied, verify-db 32/32, suite 45/45.
**[dev, 2026-09-09]** migration 80 applied to `ep-withered-field-b23csnyq`
(pre-flight: exactly one pending), verify-db 32/32; demo seed re-run, which now
writes the two demo handles `nile-academy` / `hossam-aziz`.
**[test (Neon) and production]** NOT applied. Schema first, then code, per the
2026-08-02 lesson: `EDURA_ENV=production npx prisma migrate deploy` from
`packages/database`, then `verify-db`. `expected-db-shape.json` is at 84 tables /
80 migrations.

## Proofs

- `apps/erp/tests/db/public-handles.test.ts` — 45/45 on local test: session-owned,
  one namespace across kinds, reserved and shape refused by the service AND by the
  database, status gate, meeting link absent from the payload, rename releases,
  clear, cascade.
- `apps/erp/tests/unit/public-handle-host.test.ts` — 12/12: the rules and the host
  resolver, including lookalike hosts and the dormant default.
- `apps/erp/tests/unit/tenant-host-proxy.test.ts` — 6/6: rewrite, redirect, CSP still
  minted, ordinary hosts untouched, dormant without the env var.
- Browser: `/ar/p/nile-academy` renders; the settings card seeds the current name,
  reports `www` as reserved live, and saves/restores a rename.
