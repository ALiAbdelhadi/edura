# REQUESTS — الدفتر / The Ledger

Where a portal session writes when it needs something it does not own, **then stops and
builds something else**.

## Why this exists

Five sessions work in parallel on separate worktrees. None can see the others' work. If a
session edits a file it does not own — `packages/ui`, another portal's folder, a shared
`features/` folder — the owning session will not know why their code changed, and the
conflict surfaces at merge time when both branches are large. Filing a request is slower
than editing directly. It is also the only thing that prevents the most expensive class of
conflict in this project.

## How it is routed

The operator reads open entries, lands the change in the shared layer, merges it, and tells
you to rebase. **Do not carry a local patch to shared code across a rebase** — if you needed
one, that was a request you should have filed.

## Format

```
## [OPEN] <portal> — <one-line summary>
Needs:      <the change, precisely>
Why:        <which screen, which guarantee>
Blocking:   <yes: session is stopped | no: has a local workaround>
Proposed:   <the API or value you would use>
Consumers:  <every file your change would affect — name them, so the shared-layer
             session can size it without re-deriving your work>
```

Mark an entry `[LANDED]` with the commit when it merges, or `[DECLINED]` with one line of
reasoning. Never delete an entry — a declined request is information the next session needs.

---

## [LANDED] worked example — teacher+assistant — delegation strip needs a shell slot

```
Needs:      DashboardShell to accept delegation context (principal name + id) and render
            it in the slot superadmin uses for the financial cycle.
Why:        Assistant portal, every screen. "An assistant writes on another's behalf" is
            the portal's distinguishing guarantee, so it must be permanent chrome rather
            than something each screen remembers to render.
Blocking:   yes — cannot be built from features/teacher; the shell is shared by all portals.
Proposed:   <DashboardShell delegation={{ principalName, principalId }} />, null for every
            non-delegated role.
Consumers:  apps/www/src/components/refine/dashboard-shell.tsx (the shell itself);
            dashboard/assistant/layout.tsx (only caller passing a non-null value);
            the other five layouts pass nothing and are unaffected.
```

*Kept as the format example. Landed by the foundation session 2026-07-28.*

---

## [OPEN] foundation → center-admin+staff — `next/image` crash in admin-rooms-screen

```
Needs:      A `width`/`height` (or `fill`) on the <Image> at
            apps/www/src/features/admin/admin-rooms-screen.tsx:270.
Why:        Not a design issue — the page throws "Image with src ... is missing required
            width property" and renders blank, so /dashboard/admin/rooms cannot be reviewed
            at all. Found while verifying the token layer; pre-existing, not caused by it.
Blocking:   no — for the foundation session. Likely blocking for whoever reviews that route.
Proposed:   The cover images are remote (picsum in demo data), so `fill` with a sized
            parent is probably right given the existing `aspect-video` wrapper.
Consumers:  apps/www/src/features/admin/admin-rooms-screen.tsx only.
```

*Filed rather than fixed: `features/admin/**` belongs to the center-admin+staff session.*
