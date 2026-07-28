# PROPOSED — Messaging oversight + the disclosure pattern

**Status:** proposal, awaiting merge into `design/DECISIONS.md`
**Author:** Parent portal session (`claude/portal-parent-docs-5fd4bc`)
**Date:** 2026-07-28

Posted early and deliberately. The disclosure renders on the **child's** side too, and the
child's side is built by the student session. Per `02-PORTAL-parent.md` §Cross-portal screens,
the parent session defines this archetype; this file is that definition.

This is a **separate filename from `DECISIONS.md` on purpose** — the foundation session owns
that file and has not written it yet. Fold this in verbatim, or reject it, but do not let the
two halves get built from nothing.

> **Read the "Enforced boundaries" section before designing.** Every visual decision below is
> derived from something the API actually does. Where I could not verify a guarantee, I say so
> rather than inventing one.

---

## 1. Enforced boundaries — verified, not assumed

The interface's job is to be honest about these. All five are server-side; none is a UI
convention that a future refactor can quietly drop.

| Boundary | Where it is enforced |
|---|---|
| **Approved links only** | `chat-oversight.ts:81` — `parentStudentLink` filtered `status: "approved"`. A pending or revoked link yields nothing. |
| **Minors only** | `chat-oversight.ts:95` — `isMinorStudent()`. Default-minor: adult requires a *verified* DOB showing 18+. Unknown or unverified ⇒ oversight stays active. |
| **Adult threads only** | `chat-oversight.ts:117` — partners filtered to `ADULT_ROLES` (teacher, assistant, center_admin, center_staff). Student-to-student is never visible. |
| **Read-only** | No write path exists. There is no composer in the UI and no POST route under `parent/oversight/**`. |
| **Never touches read state** | Reading a thread through oversight does not mark it read for the child, and does not move unread counters. |

**The design consequence:** these are not caveats to disclose in small print. They are the
feature. Four of the five are *limits on the parent*, and a parent who understands them trusts
the surface more, not less.

---

## 2. The disclosure has THREE audiences, not two

The brief says "both sides". The shipped code is already better than that, and the pattern
should keep it. At [`chat-screen.tsx:350`](../apps/www/src/features/messaging/chat-screen.tsx)
the banner renders for **every participant in a monitored thread**, branching on who is
looking:

| Audience | String | Renders |
|---|---|---|
| The **minor** | `chat.oversightBannerStudent` | «يمكن لولي أمرك الاطلاع على هذه المحادثة.» |
| The **adult partner** (teacher/assistant/staff) | `chat.oversightBanner` | «يمكن لولي الأمر الاطلاع على هذه المحادثة.» |
| The **parent**, in the oversight surface | `oversight.readOnlyNotice` | «عرض للاطلاع فقط. فتحك لها لا يجعل أي رسالة مقروءة لدى ابنك.» |

Three audiences, three truths, one fact. **Do not collapse these into one string.** The teacher
needs to know they are writing to a monitored thread — that changes how a professional writes.

**Binding for the student session:** the child's banner is not a parent-portal element that
happens to appear elsewhere. It is a *peer* of the parent's. Same anatomy, same slot, same
persistence. Differences are limited to the string.

---

## 3. Anatomy — the disclosure strip

A **rule-bounded strip**, not a card, not a toast, not a tooltip.

```
┌─────────────────────────────────────────────────────┐
│ ◎  Your parent can view this conversation.          │   ← strip
├─────────────────────────────────────────────────────┤   ← 1px --rule
│  … thread …                                          │
```

- **Slot:** directly below the conversation header, above the first message. Inside the
  thread's rule box, so it reads as a property *of this thread*, not chrome floating over it.
- **Persistence:** always rendered while the thread is monitored. **Not dismissable, not
  collapsible, no "don't show again".** A disclosure you can turn off is not a disclosure.
- **Ground:** `--sheet` with a hairline `--rule` beneath. Per the constitution, tonal shift is
  *not* the separator — the rule is. No tint wash, no soft shadow.
- **Icon:** a single outline eye at text size. **Does not flip in RTL** (non-directional set).
- **Type:** body scale, `--ink-2`. **Not mono** — this is prose, not a figure. Not italic, not
  smaller than surrounding UI text.
- **Height:** one line at 390px in Arabic. Verified: the longest string
  (`chat.oversightBannerStudent`) fits. If a future string wraps, it wraps — do not truncate a
  disclosure or put it behind a "more" link.

### Explicitly rejected

| Rejected | Why |
|---|---|
| Amber / warning colouring | Oversight is not a fault state. Amber is reserved for *waiting*. Colouring a lawful safeguard as a warning teaches the child they have done something wrong. |
| Red, lock icon, "restricted" | Same, worse. |
| Toast or transient snackbar | Disclosure must hold for the life of the thread. |
| Tooltip / info affordance | The brief is explicit: not "a legal notice tucked into a tooltip". |
| A badge on the conversation list only | The disclosure belongs where the writing happens. |

The strip should read like a **printed notice on a form**: quiet, permanent, unembarrassed.
That is the dignity requirement, and it is achieved by *neutrality*, not by softening.

---

## 4. Anatomy — the parent's oversight surface

Two levels, one back path. Phone-first, `comfortable` density.

**Level 1 — children.** One row per approved link.

- **Minor child** → row is a link. Secondary line carries `oversight.conversationsCount`.
- **Verified-adult child** → **not a link, and not a disabled link.** No pointer, no hover, no
  greyed chevron. It carries a plain line: `oversight.adultChild` — «هذا الطالب بالغ موثّق،
  لذلك محادثاته خاصة.»

  That line is the pattern's thesis in one sentence: *where a parent cannot act, there is
  nothing to click and a plain line saying why.*

  **FIXED (2026-07-28).** The previous screen used `opacity-75` on a card that was still
  clickable, guarded only by an `&&` inside the handler — a greyed affordance implying a door
  that the right permission would open, when no permission opens this one. The adult-child row
  is now a plain `<li>` with no interactive element at all.

**Level 2 — the child's adult threads.** List + reader.

- Header: child's name, back control, the `oversight.readOnlyNotice` strip.
- Rows: partner name, **role chip** (teacher / assistant / center staff), message count, last
  activity date.
- Reader: messages, no composer, **no composer placeholder, no disabled input.** The area
  where a composer would be simply ends. Absence is the honest signal.

---

## 5. States — all five, both levels

| State | Level 1 (children) | Level 2 (threads) |
|---|---|---|
| **Loading** | skeleton rows, no spinner-in-a-box | skeleton rows |
| **Empty** | `oversight.noChildren` — «لا يوجد أبناء مرتبطون بعد» + a link to the linking flow, the one real action | `oversight.noConversations` — «لا توجد محادثات مع الفريق بعد» |
| **Partial** | mixed minor / verified-adult children on one screen — the common real case, must not look broken | thread with only removed messages |
| **Error** | inline, retryable, states what failed | same |
| **Full** | multiple children, several threads each | long thread, scrolled |

**The previous screen failed "error" in a specific way worth naming:** all three `catch`
blocks set state to `[]`, so **a failed request rendered as "no children" / "no
conversations".** On a child-safety surface, silently reporting *nothing to see* when the
truth is *we could not check* is the most damaging failure the screen can have.

**FIXED (2026-07-28)** at the type level rather than by remembering: state is now
`{status:"loading"} | {status:"error"} | {status:"ok", data}`, so emptiness is not
*representable* as failure. Each error state names what failed and offers a retry.

---

## 6. Removed messages

A soft-deleted message keeps its body in the database; participants see "message removed" and
the super-admin log sees the body. **Parent oversight follows the participant rule, not the
admin rule** — the parent sees `chat.removedMessage`, not the body. Oversight is not
moderation. Render as ink-3 prose in the bubble's place, no strikethrough.

---

## 7. RTL and Arabic

- Thread alignment follows the reader, not the writer: the **child's** messages take the
  "own message" side so the parent reads their child consistently. Verified present today
  (`fromChild` at `oversight-screen.tsx:297`) — keep it.
- The eye icon does not flip. The back control does.
- Role chips are translated (`roles.*`), never raw role slugs.
- Timestamps are locale-formatted via `useFormatters` — already correct.
- Latin-in-Arabic (names, IDs) needs bidi isolation per the constitution's rule.

---

## 8. What the student session must build

The contract, so the halves match:

1. The child's banner uses **`chat.oversightBannerStudent`** and the anatomy in §3 — same slot,
   same ground, same rule, same non-dismissable persistence.
2. It renders whenever `chat.oversight?.monitored` is true for a thread the child is in.
   **Do not gate it on anything else** — not on a preference, not on first view.
3. The child is never shown *what the parent has read* — there is no read receipt back to the
   child, and inventing one would be surveillance in the opposite direction.
4. If the student session changes the banner's anatomy, that is a change to **this** entry, and
   the parent session must follow. Post it; do not fork it.

---

## 9. Blocked on — requests for `REQUESTS.md`

These are the parts of my own signature surface I cannot reach:

### [OPEN] Parent — oversight strings live outside portal i18n
```
Needs:      oversight.* and chat.oversightBanner* live in the shared monolith
            messages/{ar,en}.json, not messages/*/parent.json.
Why:        Oversight is this portal's signature surface; its strings are in a
            file two sessions (parent + whoever owns messaging) must both edit.
Blocking:   no — I can build against the existing keys unchanged.
Proposed:   Either move the oversight.* block into parent.json, or name the
            monolith an explicit coordination point in CONSTITUTION.md.
            The chat.oversightBanner* pair must stay shared — it renders for
            three roles.
```

### [OPEN] Parent — the child-side banner is in a folder nobody owns
```
Needs:      features/messaging/chat-screen.tsx:350 renders the disclosure for
            the minor and the adult partner. My brief says I define this
            pattern; the file is in a shared folder assigned to no session.
Why:        Signature surface, split across an ownership boundary.
Blocking:   no — the pattern is specified here and can be applied by the owner.
Proposed:   Name an owner for features/messaging/** in the worktree plan, and
            route this spec to them.
```

---

## 10. Dependencies this spec has on foundation

Written in Ledger vocabulary (`--sheet`, `--rule`, `--ink-2`) because that is the target
system. **None of those tokens exist in the repo yet** — see the session report. When the
token layer lands, the only values this spec needs pinned are: the strip's ground, the rule
weight, and the `--ink-2` contrast pair at body size. Nothing here depends on a token *name*
surviving; it depends on rule-as-separator and no-tonal-wash, which are constitutional.
