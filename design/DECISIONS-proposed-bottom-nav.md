# PROPOSED — Bottom navigation (shared primitive)

**Status:** proposal, awaiting merge into `design/DECISIONS.md`
**Built by:** Parent portal session, at the operator's direction
**Date:** 2026-07-28
**Lives at:** `packages/ui/src/components/bottom-nav.tsx`

Foundation Part C lists this as phone chrome for **student, parent and staff**. It is built
and wired in the parent portal. **Student and staff sessions: import it, do not rebuild it.**

---

## 1. It is the sidebar, rotated — not a second nav system

Same destinations, same grouping, same active device. The sidebar's active state is a 3px
`--indigo` bar on the **inline-start** edge; on a horizontal axis that same bar sits across the
**top** of the item. One device, turned 90° because the axis turned.

A horizontal bar has no start or end, so it does **not** mirror in RTL and must not be given a
flip rule.

## 2. API — and why it is shaped this way

```tsx
<BottomNav
  items={items}          // BottomNavItem[] — key, href, label, icon, badge?, badgeLabel?, group?
  activeKey={activeKey}
  maxVisible={5}         // total slots INCLUDING "more"; 4–5 is the designed range
  linkAs={Link}          // next/link, injected
  navLabel={…} moreLabel={…} moreTitle={…}   // all already localized
/>
```

Two constraints drove it, and both are load-bearing:

- **`linkAs` is injected, not imported.** `packages/ui` has zero `next/` imports today and must
  keep it that way. Default is `"a"`, so the component still works in isolation and in
  superadmin.
- **Nothing is translated inside.** Every user-visible string, including the accessible badge
  text, arrives already localized. This package has no i18n and giving it one would hand it an
  opinion about locale and routing that the apps already hold.

`group` is **optional**: portals with a flat nav pass none and get a flat "more" sheet; portals
that have adopted the three-group sidebar pass groups and get a grouped one. Both work without
editing the component — which is the bar a shared primitive has to clear.

## 3. Three behaviours that are decisions, not details

**The active destination is always reachable in one press.** If it would fall into the
overflow, it is promoted into the last visible slot and displaces the item there. Otherwise a
user sitting on Settings sees a bar that does not admit their screen exists. Pure and exported
as `computeSlots()`; proven in `apps/www/tests/unit/bottom-nav-slots.test.ts` (**7/7**).

> The test earned its keep immediately: at `maxVisible: 1` there is no slot to promote *into*,
> and the first implementation pushed an `undefined` into the overflow array, which throws on
> render. Guarded and covered.

**Hidden counts roll up onto "more".** A count nobody can see is not a count. If notifications
does not make the bar, its unread total appears on the entry concealing it — and reaches the
accessible name, since the visual chip is `aria-hidden`.

**Badges are mono chips with real text, never a bare dot.** `--amber` on `--amber-soft`,
because a count is something *waiting*. The bare `aria-hidden` red dot on pending
registrations is the defect the audit named; this closes it for every portal at once.

## 4. Ergonomics

60px items (48px is the floor for a touch target; 60 gives icon + label room) · `md:hidden` ·
`env(safe-area-inset-bottom)` respected · the component renders **its own spacer**, so a
consumer cannot forget it and leave the last row of content under the bar — but it must be
placed inside the content's scroll container for the spacer to do its job.

## 5. Per-portal ordering is the portal's call

The bar's order is deliberately **not** the sidebar's. The sidebar reads as a logical grouping;
the bar is four thumb slots ordered by what that role actually opens daily.

Parent ships: **Dashboard · Attendance · Fees · Messages · More**. Attendance ("did my child
turn up") and Fees ("what do I owe") are the two daily questions for an Egyptian K-12 parent
and outrank Progress, which is checked when grades post.

Student and staff should pick their own four on the same reasoning and record it here.
