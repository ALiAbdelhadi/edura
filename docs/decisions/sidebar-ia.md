# Sidebar information architecture — all 8 portals (built 2026-08-11 — awaiting review)

Every role's sidebar is now grouped under headings, on ONE taxonomy shared
across the portals, with the order inside each group argued in the file rather
than left to whoever appended the last entry. Ali's request, 2026-08-11. No
route was added or removed and no capability changed — this is navigation only.

1. **BOTH GROUPING MECHANISMS ALREADY EXISTED AND RENDERED NOTHING.**
   `apps/www`'s `DashboardShell` accepted a `navGroups` prop with **zero
   consumers**, and `apps/superadmin`'s layout tagged every one of its entries
   with `group: "Oversight" | "Money" | "Comms"` while its shell's `NavItem`
   type never declared the field and its render was a flat `navItems.map` —
   TypeScript does not reject an excess property that arrives through a
   variable, so the field was inert and nobody found out. The `navGroup.*`
   translations existed in ar and en the whole time. Twenty-one destinations
   shipped as one unbroken column with their headings sitting unused in the
   message catalogue. The superadmin shell now takes `navGroups` like www's,
   which makes the grouping a structure the compiler can see instead of a
   property nothing reads.
2. **ONE TAXONOMY ACROSS PORTALS, on purpose.** `@learn` `@teach` `@counter`
   `@ops` `@children` `@money` `@team` `@comms` `@account` `@governance`. A
   person who gains a second portal should meet the same sequence with different
   members, not a second menu. The `@` prefix is not decoration: it keeps a
   heading from ever colliding with a destination label in the `NAV_KEY` lookup,
   so a screen called "Money" cannot resolve to the money group's translation.
3. **THE GROUPING THRESHOLD IS ~8 ENTRIES, and two portals sit under it
   deliberately.** Below about eight, scanning a column is cheaper than scanning
   headings, so `center_staff` (max 8, and sub-role-filtered — a receptionist
   sees six, an accountant five) and `finance` (7) stay FLAT. Their ORDER still
   mirrors the grouped portals' sequence exactly, which buys the cross-portal
   consistency without the furniture. **Do not read those two as an oversight**
   — the reason is written in both files.
4. **A ONE-ITEM `@money` GROUP KEEPS ITS HEADING** (student wallet, teacher
   wallet). Money is the most-scanned word in this product; folding a wallet
   into a general group to avoid a short list buries the thing people came
   looking for.
5. **The order inside each group is the shape of the work, not the alphabet.**
   `@teach` is the shape of a lesson (open the class → take the register → the
   door → the marks → the material). A center's `@money` is in, out, then the
   summary of both. The super admin's `@money` runs payments → subscriptions →
   payouts → settlements and then puts **commission and wallet policy last**,
   because those two CONFIGURE the four ledgers above them rather than reporting
   them, and a setting listed among records reads as another record. `@children`
   leads with Children because the child selector governs every screen below it.
6. **A NEW `@governance` GROUP.** Audit log, Security, Deletion requests and
   Feature flags were filed under "Comms". None of them is communication — they
   are what the platform does to ITSELF, and an audit trail listed beside a
   WhatsApp log is how an operator stops trusting the headings. It is also the
   group whose entries a regulator would ask for.
7. **THE ASSISTANT'S COMMS PAIR SITS IN THE UNLABELLED HEAD GROUP**, where every
   other portal puts its home — because on this portal the home IS the inbox
   (`/dashboard/assistant` is the messages route). A heading over the top two
   entries would file this portal's front door away as one topic among several.
   The rest of that portal mirrors the TEACHER's grouping in the same order: an
   assistant acts on the teacher's behalf on those same screens, and two people
   doing one job should not learn two menus. It has **no `@money` group at
   all**, which is the Step 8 delegation boundary showing through rather than an
   omission.
8. **PHONE BARS: the first four are the decision, the tail is now the sidebar's
   order.** `BottomNav maxVisible={5}` spends one slot on "more", so exactly
   four destinations get a thumb; those stay chosen by what the role opens
   standing up and were NOT re-argued. Everything after them used to be
   hand-written and presented a different ordering of the same links — a second
   information architecture for one portal — and now follows the sidebar. Every
   href is still listed in every bar; the shell's dev-only reachability guard is
   what enforces it.
9. **GROUPING IS A RENDERING CONCERN, held that way in both shells.** One
   `flatNav` feeds the active-item resolution, the header title, the phone bar
   and the reachability guard, so a group can never hide a destination from the
   bar's exhaustiveness check. Otherwise grouping would have become a new way to
   make a screen unreachable.
10. **GROUPING SURFACED TWO ARABIC LABEL BUGS THAT THE FLAT LIST HAD HIDDEN** by
    keeping the offenders far apart. Worth recording as a technique: adjacency
    is a review tool.
    - `nav.materials` was `المواد`, and grouping put it four rows from
      `nav.subjects` `المواد الدراسية` inside `@learn`. Now `الملفات التعليمية`.
    - `nav.teachers` was `المعلمون` sitting directly above `مدرسون خارج النظام`
      — two different words for teacher, adjacent. The product uses مدرّس
      **111** times against معلم **11**, and `apps/superadmin` already said
      `المدرّسون`, so www was the outlier; both entries now use مدرّس.
    - **AND THEN THE WHOLE WORD WAS NORMALISED (Ali, same day).** The nav fix
      above left `roles.teacher` = `معلم`, which Ali rejected: معلم and مدرّس
      are the same person, so the product must not carry both. **172
      occurrences across 18 files** became مدرّس — every message catalogue in
      both apps, the help content, `docs/guides/*`, the welcome email template,
      and `preview-seed.ts`. The replacement swapped only the STEM
      (`/معلّ?م/ → مدرّس`), so every prefix and suffix survived intact
      (`بالمعلمين` → `بالمدرّسين`, `معلميك` → `مدرّسيك`, `معلمًا` → `مدرّسًا`);
      a scan afterwards confirmed zero of the old stem remain and that every
      inflected form produced is well-formed. `apps/showcase` needed no change —
      it already said مدرّس everywhere.
    - **A BLIND `sed` WOULD HAVE BROKEN A TEST, and that is the lesson.**
      `apps/www/tests/e2e/smoke.e2e.ts` asserts on the quick-login tile label
      `"معلم"`, which is rendered FROM `roles.teacher` — so the assertion had to
      move with the string it reads. It was included in the same pass. Grep for
      the literal, not just the key, before renaming any user-visible string.
    - **Not touched: the English side.** "Teacher" was never ambiguous.

**No database migration, no schema change, no API change, and no route added or
removed.** Files: both `dashboard-shell.tsx` files, the eight portal layouts,
and `navGroup.*` in all four message catalogues.

**`tests/unit/portal-bottom-nav-parity.test.ts` WAS HARDENED, AND IT CAUGHT THIS
WORK FIRST.** That test reads the layout SOURCE and matched quoted strings with
no comment handling at all, so the marker comment added to each `BAR_ORDER`
(`— the "more" sheet, in sidebar order —`) was read as a phone-bar destination
and failed all five portals. The parser now strips comments — but the reason it
was worth fixing rather than just rewording the comment is the OTHER direction:
`navHrefs` matched `href: "…"` anywhere too, so a commented-out nav entry would
have counted as a live destination and let a genuinely unreachable screen PASS.
Stripping comments only ever removes non-code, so neither assertion was weakened;
line comments are cut only outside double-quoted strings so a future href
containing `//` survives. **Both directions were then proven by negative
control**, not assumed: deleting one href from a `BAR_ORDER` fails
"puts every sidebar destination in the phone bar", and commenting out one nav
entry while leaving it in the bar fails "names no phone-bar destination that the
sidebar lacks". The old parser demonstrably read comment content — that is
exactly why it produced five false failures here.

Proof: a completeness script asserts, per portal, that the destination count
still matches the pre-edit list, that no nav or bar list has a duplicate, and
that every sidebar href appears in that portal's `bottomNav` — **zero
destinations lost, every phone bar exhaustive**. `bun run check-types` **9/9**,
`bun run build` **3/3**, unit suites **www 1107 pass / 1 skip (70 files)**,
**superadmin 106**, **showcase 22**. Verified live in the browser on dev for the
student (4 groups), center admin (6 groups — the longest menu in the product) and
teacher portals, in **Arabic / RTL / dark** and **English / LTR / light**,
including the collapsed icon rail, where the headings hide and the menus' own
padding still carries the grouping. After the word normalisation the browser was
re-checked: the quick-login tile and the teacher portal's role label both read
مدرّس, and the old stem appears nowhere in the rendered page.

**NOT verified in the browser: the `apps/superadmin` portal** — it is behind a
2FA login whose credentials Claude will not enter. Its grouping is covered by
typecheck and build only. The first `bun run build` failed with "Another next
build process is already running"; that is a dev server holding `.next` in the
same folder, not this change, and it passed once the server was stopped.

**Deliberately NOT done:** the in-page tab bars were surveyed and left alone —
there are only eight files using `TabsList`, most are two-tab, and the largest
(`center-oversight-screen.tsx`) already carries a two-level `TAB_GROUPS`
taxonomy (people / academic / money / platform) that is coherent with this one.
