# Imagery of the system

Nineteen assets — eight for the landing, eleven more for the five role pages. Every one of them is already reserved in the page: the layout is
final, each plate is holding its exact aspect ratio, and dropping a file in
changes pixels and never geometry.

**The only edit needed per asset** is one line in
[`src/media/manifest.ts`](../src/media/manifest.ts) — set `src` (and `poster`
for the clip). Nothing else moves.

```ts
counterBoard: { …, src: "/system/counter-board.mp4", poster: "/system/counter-board.jpg" },
```

Files go in `public/system/`. The filename stem is the slot's `id`.

---

## THE RULE THAT OVERRIDES EVERYTHING ELSE

**No real person appears in any of these.** This product's users are mostly
children, and a marketing screenshot is the easiest place in a company to leak
a roster.

Before capturing, seed a demo center and shoot that. Nothing on screen may be
a real student name, a real phone number, a real national ID, a real guardian
email, a real receipt number tied to a real payment, or a real wallet balance.
Blurring afterwards is not the method — a blurred name still says a name was
there, and blurs get undone by a screenshot of the screenshot.

Check every capture for: the browser's own autofill/history dropdowns, an
open notification toast naming somebody, the account menu in the corner, and
anything in a sidebar badge counter that reveals a real figure.

---

## How to capture

- **2× device pixel ratio.** Shoot at the listed CSS size with
  `deviceScaleFactor: 2`; the file is twice those numbers in pixels.
- **Light theme, Arabic/RTL** unless a slot says otherwise. Arabic is the
  product's primary language and the site's default locale; an all-English
  screenshot set on an Arabic page reads as a product that was translated.
- **Stills:** WebP (`cwebp -q 82`), or AVIF if it comes out smaller. Keep each
  under ~180 KB — Egyptian mobile data is the constraint, not the desktop.
- **The clip:** MP4 (H.264, yuv420p) **and** WebM, 8–12 seconds, silent, no
  captions burned in, no cursor trail effects. Under ~2 MB. It loops, so the
  last frame must sit next to the first frame without a jump. Ship a poster
  still from the clearest frame — the poster is what a reduced-motion reader
  sees, so it has to make the point on its own.
- **No browser chrome, no OS chrome, no cursor.** The page frames these itself
  as plates; a screenshot of a browser inside a browser adds a second frame
  and no information.
- Shoot the app at a **1440×900 window**, not maximised on a large display —
  a screenshot of a 2560px-wide layout is unreadable when it lands in a 26rem
  column.

---

## The eight

| Slot | App | Size (CSS) | The screen, and the state it must be in |
|---|---|---|---|
| `counter-board` | `apps/erp` | 1440×900, **clip** | The counter board mid-shift. A lesson running now already selected, a roster visible, and the sequence the section claims: find a student → take cash → check in, without the page changing. This is the only moving image on the site because SPEED is the only claim a still cannot make. End the loop back on the roster so it repeats cleanly. |
| `settlement-confirm` | `apps/erp` | 1120×840 | The two-step confirm before a lesson closes, showing the quoted split — platform / center / teacher — with the amounts legible. This is the money section's evidence, so the figures must be readable at 22rem wide. Prefer a round example price. |
| `student-card` | `apps/erp` | 390×844, phone | The student ID card screen on a phone viewport. The eight-character code and the QR both visible. Use a demo student; the QR encodes a signed URL, so a real one is a real credential. |
| `role-center` | `apps/erp` | 1440×900 | The center's own board: today's takings and who still owes. The two numbers a center owner opens the app for. |
| `role-teacher` | `apps/erp` | 1440×900 | A teacher closing a lesson with the split in front of them **before** confirming — the same claim as `settlement-confirm` but from the teacher's side of the desk. |
| `role-parent` | `apps/erp` | 1440×900 | A parent paying for one lesson or a month from their own wallet, with the child selector visible so it is obvious whose lesson it is. |
| `role-student` | `apps/erp` | 1440×900 | A student's subjects — assigned from year and track, not chosen — beside their schedule. |
| `role-assistant` | `apps/erp` | 1440×900 | An assistant recording attendance for a teacher, **with the on-behalf-of attribution visible on screen.** That attribution is the whole point of the role and the only thing that distinguishes this shot from the teacher's. |

The five `role-*` shots share one plate that swaps as the reader moves through
the roles, so they must be **composed alike**: same window size, same theme,
same zoom, same amount of chrome. Five shots framed differently make the swap
read as a glitch rather than as a comparison.

---

## The role pages

`/for/{center,teacher,parent,student,assistant}`. Each page reuses its `role-*` shot
above as the hero, then takes **one plate per capability GROUP** — not per
capability. Nineteen screenshots down the center's page is nineteen things
nobody looks at.

The groups are the ERP sidebar's own, so each shot is simply "that group's
hardest screen".

| Slot | App | Size (CSS) | The screen |
|---|---|---|---|
| `center-counter` | `apps/erp` | 1440×900 | `/dashboard/admin/counter` mid-shift — a lesson selected, a roster, and the cash step open. Different framing from the `counter-board` clip: this one is a still of the roster, the clip is the sequence. |
| `center-ops` | `apps/erp` | 1440×900 | `/dashboard/admin/schedule` — the week across halls, with a conflict visibly refused if you can stage one. Falls back to `/rooms` showing a hall's per-student rate. |
| `center-money` | `apps/erp` | 1440×900 | `/dashboard/admin/reports` — net profit with the on-platform vs off-system split visible. This is the center's whole argument in one screen. |
| `center-team` | `apps/erp` | 1440×900 | **`/dashboard/staff/reports`, shot twice from the same URL** — once signed in as the center MANAGER, who sees the report, and once as the RECEPTIONIST, who is refused it. Composed as one plate. The permission tiers are the point, and this is the only framing that shows a tier doing something rather than being described. |
| `teacher-teaching` | `apps/erp` | 1440×900 | `/dashboard/teacher/attendance` with the register open and the **close-lesson preview showing the split** — the page's central claim. |
| `teacher-manage` | `apps/erp` | 1440×900 | `/dashboard/teacher/centers` — a collaboration request with subject, year, hall, schedule and share on it. |
| `teacher-wallet` | `apps/erp` | 1440×900 | `/dashboard/teacher/wallet` — entries that each name their source lesson. Use a demo teacher with several settled lessons so it is not one row. |
| `parent-children` | `apps/erp` | 1440×900 | `/dashboard/parent/attendance` or `/progress` with **two children** on the account, so the child selector is doing visible work. |
| `parent-pay` | `apps/erp` | 390×844, phone | `/dashboard/parent/pay` mid-flow — child picked, lesson picked, paying from the parent wallet. Phone, because this is a phone task. |
| `student-learn` | `apps/erp` | 390×844, phone | `/dashboard/student/subjects` — track subjects listed, with the "browse all" entry visible. Phone. |

| `assistant-door` | `apps/erp` | 390×844, phone | `/dashboard/assistant/door` — the second check-in at the hall door, on a phone, because that is where it is actually done. The one screen that is the assistant's and nobody else's; the rest of that page reuses the teacher's plates on purpose, since an assistant sees the teacher's own screens. |

`student.money` is deliberately unillustrated: a wallet balance is a number,
and a screenshot of a number is worth less than the sentence beside it.

---

## Changed after the shooting inventory

**`center-team` moved off `/dashboard/admin/staff`** (2026-08-16). That page
renders zero rows on every demo center, so it could only ever have shown the
three sub-roles as a list of names — a claim about permissions with no evidence
of permissions. `/dashboard/staff/reports` returns four rows to a manager and a
refusal to a receptionist, from the identical URL, which is the same claim with
the mechanism visible. Full reasoning and the probe data behind it:
``apps/erp/tools/system-shots/INVENTORY.md``.

---

## Not yet decided

- Whether the role plates should also exist in **English/LTR** and swap with
  the locale. It doubles the set to thirteen files for a gain most visitors
  never see, so it is deliberately deferred until the Arabic set exists and
  can be judged.
- Whether the counter clip needs a **short caption track** for the three steps
  it performs. If the flow is not self-evident in the footage, the fix is
  probably a slower clip rather than text over it.
