# Parent portal de-duplication (2026-08-10, Ali — NO capability removed)

The same audit that cleaned the center portals, applied to the parent's. Its
home carried, below four metrics, a "recent grades" list, a "recent payments"
list and three charts — and EVERY one of them was a truncated copy of a section
that exists in full on a page the sidebar already lists.

1. **THE HOME IS AN INDEX NOW, NOT A SMALLER COPY.** Deleted from
   `parent-dashboard.tsx`: the recent-grades list (full on `/progress`), the
   recent-payments list (full on `/fees`), and the trends section — the
   paid-vs-due arc, the attendance line and the grade line (whose full versions
   are the payment timeline on `/fees`, the subject comparison on `/progress`
   and the attendance screen itself). A parent was reading the same thing twice
   and getting the shorter version first. The four figures stay, and each one
   now OPENS the page that owns it, so the home answers "where do I go" instead
   of half-answering "what happened".
2. **`/progress` lost its attendance-rate metric.** Attendance is `/attendance`'s
   entire subject and the number was also on the home — three copies of one
   figure, on a page about grades. The `me/attendance` request that existed only
   to feed it went with it, so the grades page now makes one query fewer.
3. **Deliberately NOT touched:** the note on `/fees` pointing at `/pay`. It is a
   sentence naming where paying happens, not a second copy of the pay flow — the
   distinction this pass is drawing is between a POINTER and a COPY.

Nothing was removed from the portal: every list and every chart still exists at
full size on its own page, one tap from the sidebar or from the metric that
summarises it.
