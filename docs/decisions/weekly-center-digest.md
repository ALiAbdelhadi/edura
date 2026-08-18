# Weekly center digest (built 2026-08-09 — awaiting review)

An owner's Monday email: last week's revenue, expenses, net, attendance,
lesson count and pending gaps. Template in `packages/notifications`
(`weekly-digest.tsx`), job `runWeeklyCenterDigest` in
`apps/www/src/lib/services/cron/jobs.ts`, cron case `weekly-center-digest`.

1. **ONE CALL FOR THE FIGURES.** Everything in the email comes from
   `getNetProfitReport` — the same service the reports screen and the CSV
   export use — plus a session count. The digest is not allowed its own
   arithmetic, for the reason in decision #1 of the report-export section.
2. **THE WEEK REPORTED HAS FINISHED.** Sunday 00:00 → Saturday 23:59:59 UTC of
   the week BEFORE the run, never the week the owner is living in.
3. **IDEMPOTENCY IS AN APPEND-ONLY `audit_logs` ROW** (`center.weekly_digest_sent`),
   keyed on the PERIOD, because no `notification_type` exists for a digest and
   adding one is a migration this did not need. A cron that fires twice — a
   retry, an overlapping schedule, a manual run after a failed one — must not
   mail the same owner the same week twice.
4. **THREE OUTCOMES, NOT TWO, AND ONLY A REAL SEND IS RECORDED.** `send` never
   throws, it reports, and the notifications package draws a line this job must
   not erase: `skipped` is a DELIBERATE non-send (console mail in dev, a preview
   run, a channel switched off), `failed` is a fault. Collapsing them made every
   dev run report failures for centers whose digest was correctly not sent. A
   week that was not actually delivered stays OWED — no audit row — so it goes
   out once mail is configured rather than being recorded as delivered.
5. **NOBODY TO WRITE TO IS A STATE, NOT A FAULT.** No owner, no address, or a
   closed account counts as skipped. The digest is never a way around a
   suspended account.
6. **THE COMPLETENESS REPORT IS A NICE-TO-HAVE INSIDE IT.** `buildGapReport` is
   wrapped in its own try — a center with no off-system teachers has no gaps,
   and a failure there must not cost the owner their revenue figures.

> **THE FINDING THAT MADE THE PROOF POSSIBLE, written down because it hid a
> whole code path.** In console mail mode NOTHING is ever reported as `sent`,
> so the audit row in #3 was never written — which means **the idempotency path
> was unreachable in every environment anyone had ever run this in**, and a
> second run would have re-mailed silently the day SMTP was switched on. The DB
> suite obtains a real send without sending mail by registering a stub channel
> through the notifications package's own `registerChannel` seam, gated on
> `to.centerId` so a run cannot write an audit row against a center it does not
> own. (**[dev, measured 2026-08-09]** the job iterates ~50 active centers —
> note that `prisma.center.count` reports 0 there because it reads under RLS,
> while the job's `platformDb` sees them all.)

**Scheduling — `.github/workflows/cron.yml`, and it is currently INERT.**
The repo had defined scheduled jobs since 2026-07-26 with NOTHING invoking
them; this workflow is the scheduler. **GitHub Actions and not Vercel Cron:**
Vercel's scheduler issues a GET and `/api/v1/cron/[job]` is POST-only on
purpose — M7 removed the `GET = POST` alias so a prefetcher or crawler can
never trigger a data-mutating job by following a URL, and adopting Vercel Cron
would re-open exactly that hole. The digest ticks Sundays 02:00 UTC.
**[verified 2026-08-09 with `gh secret list`] neither `CRON_BASE_URL` nor
`CRON_SECRET` is set as a repo secret, so no scheduled job is running
anywhere.** `CRON_SECRET` fails closed in every environment, so the schedule is
inert rather than dangerous — but do not read the workflow's existence as jobs
being scheduled.

**No database migration, no schema change.**

Proof: `apps/www/tests/db/weekly-digest.test.ts` **42/42** (live DB, real job,
real reports) — the finished-week window; the digest's figures equalling
`getNetProfitReport` for the same range; the second run of the same week
writing to the owner ZERO further times and adding no second audit row; a
DIFFERENT week not blocked by last week's row; `skipped` and `failed` each
leaving the week owed; suspended / address-less / owner-less centers written to
never; and a census proving three runs moved no money and wrote no in-app
notification. Unit: `weekly-digest.test.ts` **14/14** (subject, plain-text part,
the quiet-week variant, no figure in the subject line and no token in the link),
plus `notifications.test.ts` **27/27** for the registry and the channel seam.

Demo data: `prisma/weekly-digest-demo-seed.ts` (`bun run seed:weeklydigest-demo`,
`--purge` to remove) — **three ACTIVE centers, because the interesting behaviour
is who does NOT get a digest**: a live one, one whose owner is suspended, and one
with no owner at all. The hard part of seeding this feature is the WINDOW: the
job reports the week BEFORE the run, so fixtures placed "recently" land in the
current week and the digest reports a quiet week over an empty range. The seed
restates the job's own `lastWeekRange` and PRINTS the dates, so drift shows up as
dates that do not match rather than as a mysteriously empty demo. It also seeds
an OFF-SYSTEM teacher with one lesson left open — a blocking gap, and the finding
operators most often miss, since an uncompleted lesson never runs distribution
and the teacher is silently never credited.
**Verified 2026-08-09 by running the real job against it:** window
`2026-08-02 → 2026-08-08`, the live center reporting 4 lessons / 88% attendance /
`gapsCount` 2, and the suspended-owner and owner-less centers written to
NEVER. Zero money rows, so revenue reads 0.00 until you take a payment.
**It deliberately seeds NO `center.weekly_digest_sent` audit row** — that row is
the idempotency key, and planting one would suppress the first digest, which is
the exact bug the row exists to prevent.
