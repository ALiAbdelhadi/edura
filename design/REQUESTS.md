# Requests

The protocol for needing something you do not own.

## Why this exists

Five sessions work in parallel on separate worktrees. Each owns one portal's folders.
**None of them may touch `packages/ui`**, the shared shell, the shared message files, or
the shared feature directories (see [CONSTITUTION.md §7](./CONSTITUTION.md#7-ownership)).

That rule only holds if there is somewhere to put the thing you need. This is that place.

Reaching across — editing `packages/ui` from a portal worktree, or forking a component
into your own folder — produces exactly the conflict class that costs the most to unpick:
two sessions changing the same signature in different directions, discovered at merge,
with both portals already built on top. Writing an entry here is slower. It is also the
only thing that keeps four other sessions unblocked.

## How it works

1. You hit something outside your ownership.
2. **Stop.** Do not edit it. Do not fork it.
3. Add an entry below, at the bottom, using the format.
4. If you are **not blocked** (you have a local workaround that does not fork shared
   code), keep going and come back to it.
5. If you **are blocked**, say so and stop that thread of work — pick up another screen
   in your portal.
6. The operator routes it: a foundation session lands the change in `packages/ui`, merges
   it, and you rebase.

Mark your own entry `[OPEN]` → the operator moves it to `[LANDED]` or `[REJECTED]` with a
one-line note. Do not edit someone else's entry.

## Format

```
## [OPEN] <portal> — <one-line summary>
Needs:      <the change, precisely — signature, token name, or value>
Why:        <which screen, and which guarantee it has to be honest about>
Blocking:   <yes: session is stopped | no: has a local workaround>
Proposed:   <the API or value you would use>
```

Two things make an entry actionable:

- **`Why` names a guarantee, not a preference.** "The wallet balance is derived from an
  append-only ledger, so each row must link to the entry that produced it" is a reason.
  "It would look better as a list" is not — and if that is the honest reason, the answer
  is probably that the pattern already exists.
- **`Proposed` is a concrete signature or value.** A request that describes a feeling
  costs a round-trip. One that proposes `align?: "start" | "end"` can be landed or
  countered immediately.

Before writing one, check [DECISIONS.md](./DECISIONS.md). If your request contradicts a
decision, say which one and why the decision does not cover your case — that is a
legitimate request, and it is different from not having read it.

---

# Open

## [EXAMPLE — do not action] student — `<Num.Money>` needs a `strikethrough` for refunded rows

```
Needs:      A visual treatment on <Num.Money> for an amount that has been reversed.
Why:        Payment history (student portal). A refund does not delete the original
            payment — the ledger is append-only and the correction is a NEW reversing
            entry. Showing only the net balance would hide that a payment happened at
            all, which is exactly the lineage the wallet screen exists to show. The
            original row has to stay visible AND has to read as superseded.
Blocking:   no — currently rendering the amount in --ink-3, which reads as "less
            important" rather than "reversed". Wrong, but not stopping work.
Proposed:   tone="reversed" on <Num.Money> — line-through + --ink-3, paired with a
            <StatusBadge tone="rejected"> carrying the reversal's TRX- ref, so the row
            says what replaced it rather than just that it is inactive.
```

*This entry is the worked example. It is deliberately a real case: it names the guarantee
(append-only, corrections are new entries), it is honest that the session is not blocked,
and it proposes a signature rather than a mood. Delete it once real entries accumulate.*

## [OPEN] superadmin — Handoff I §5.1/§5.3 specify three surfaces the schema cannot support

```
Needs:      A correction to `design_handoff_ledger/00 - PROMPT for Claude Code.md`
            (and to DESIGN.md when it is rewritten from the Ledger spec), removing:
              §5.1  the «فروق في مطابقة الكاش» metric card
              §5.3  the «رسوم التحويل البنكي −15.00» line
              §5.3  the «بيانات التحويل» block (bank name, masked account **** 4432)
            and the cash-differences half of §5.3's clearance advisory.
Why:        None of them exist. `schema.prisma` has 70 models and NO reconciliation /
            discrepancy concept, no transfer-fee field, and no bank / IBAN / account
            column on any model. The two hi-fi HTML files are prototypes drawn with
            plausible fake data, so this is not a gap to fill — building any of the
            three would fail CONSTITUTION §8's last and most emphatic test, "no screen
            implies a capability the system does not have".
            Flagged here per the portal brief: where a supplied document conflicts with
            the constitution, the constitution wins AND the stale document gets fixed
            rather than confusing the next session. Two other sessions (teacher, center)
            build payout and settlement surfaces against §5.3.
Blocking:   no — both screens are built and landed. The cash card was REPLACED by a
            derivation from a real guarantee rather than dropped: settlePayout settles
            through an H2 conditional decrement, so a payout whose beneficiary wallet
            cannot cover the net genuinely cannot be disbursed. Recorded as D-036.
Proposed:   Adopt the D-036 replacement as the spec text, and reword §5.3's clearance to
            the two conditions that ARE checkable — "no pending refunds against this
            beneficiary, and the wallet balance covers the full amount".
```

## [OPEN] superadmin — `DataTable` needs `activeRowId` to mark the row a detail panel is showing

```
Needs:      An optional prop distinguishing "this row is open in the detail panel" from
            "this row is check-box selected".
Why:        مستحقات وصرف (D-038) uses BOTH at once: checkbox selection drives the running
            «مجموع المحدد» total and feeds the existing bulk-approve endpoint, while
            clicking a row opens the 396px decision panel. Today the `--indigo-soft` +
            3px inset bar in data-table.tsx is wired to `row.getIsSelected()`, so the two
            meanings collide — the operator gets no visual anchor for which row the panel
            is actually describing, on a screen whose whole point is that the panel and
            the row must refer to the same thing before an irreversible commit.
            center and teacher both inherit this archetype, so it is not portal-specific.
Blocking:   no — the panel carries the beneficiary name and id in its own header, so the
            subject is unambiguous even without the row marker. The marker is the polish.
Proposed:   `activeRowId?: string` + `getRowId?: (row: TData) => string`, rendering the
            3px inset bar WITHOUT the `--indigo-soft` fill (fill stays = checkbox
            selection, bar = panel subject, so the two never read as one state).
```

---

# Landed

*(none yet)*

---

# Rejected

*(none yet — a rejection gets a one-line reason, usually "the pattern already exists,
use X")*
