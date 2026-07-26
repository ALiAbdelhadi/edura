# Findings: seed re-run safety, and the super_admin fixture leak

**Date:** 2026-07-26
**Status:** recorded, NOT acted on — no fix applied, by instruction.
**Method:** read-only. Every database query ran inside `BEGIN TRANSACTION READ ONLY … ROLLBACK`.

Two items noted during the launch-readiness audit. Neither is urgent today
(production is empty and nothing is deployed); both matter before the first real
user exists.

---

## 1. Re-running the seed resets the super_admin password — and leaves old sessions alive

`prisma/seed.ts` is idempotent in the sense that matters most (a second run
creates no duplicate rows), but it is **not inert**. `mkStaffUser` upserts:

```ts
// packages/database/prisma/seed.ts:103-114
return tx.user.upsert({
  where: { email },
  update: { isDemo, passwordHash: hash, deletedAt: null },
  create: { email, name, role, status: "active", passwordHash: hash, isDemo },
});
```

`passwordHash` is in the `update` branch, so **every** re-run rewrites the
credential of the launch `super_admin` and `accountant` to whatever
`SEED_SUPERADMIN_PASSWORD` / `SEED_ACCOUNTANT_PASSWORD` hold at that moment.

Two consequences, in increasing order of seriousness:

1. **Silent credential rotation.** Re-seeding to top up the catalog — an
   otherwise innocuous, idempotent-looking act — changes the password of the
   most privileged account on the platform. If the env var has drifted since the
   last run, the operator is locked out and nothing said so.

2. **The change does not revoke sessions — which is precisely what L1 exists to
   prevent.** `token_version` is not bumped here. The L1 design records the
   session epoch in every JWT and re-reads `users.token_version` on each request,
   so that `resetPassword` invalidates tokens minted before the change (it bumps
   the column in the same transaction as the new hash). This path writes a new
   `passwordHash` **without** the bump, so any session issued before the re-seed
   stays valid for the rest of its 30-day life against a password that no longer
   exists. An attacker holding a stolen super_admin token is not evicted by
   rotating the password through the seed — the one action an operator would
   most reasonably believe evicts them.

**Shape of a fix (not applied):** bump `tokenVersion` in the same `update` as the
new hash, so the seed inherits the L1 guarantee; or narrow the `update` branch so
it never touches `passwordHash` on an account that already has one, making the
seed genuinely inert for existing staff and forcing rotation through
`resetPassword`, which already does this correctly. The second is closer to the
project's default-closed style. Either needs a decision, not a patch.

---

## 2. Forty-one non-demo `super_admin` accounts in dev are leaked test fixtures

Dev holds **42** `super_admin` rows (41 with `is_demo = false`). They are not a
misconfiguration — they are DB-test fixtures that never cleaned up.

| Bucket | Count | First seen | Last seen |
|---|---|---|---|
| `%@x.io` (test-harness domain) | 27 | 2026-07-19 | 2026-07-24 |
| test-tag prefixes (`c04`, `rbac`, `h04`, `l1`, `m2`, …) | 13 | 2026-07-21 | 2026-07-25 |
| other | 2 | 2026-07-19 | 2026-07-25 |

Sample addresses: `split-b2yejg-su@x.io`, `wref-d7s65s-su@x.io`,
`m2-61dnph-su@x.io` — the `<tag>-<random>-su@x.io` shape used by fixtures in
`apps/*/tests/db/*.test.ts`, where `-su` denotes the super_admin actor. Creation
is spread evenly across 2026-07-19 → 2026-07-25 at 3–13 per day, matching the
test-run cadence rather than any human action.

Of the two in "other", one is the real operator account
(`tarekaboelnasr999@gmail.com`); it is legitimate and must survive any cleanup.

**Why they accumulate:** the fixtures create these users **without
`is_demo = true`**, so the demo-purge convention does not see them, and whatever
per-test cleanup exists does not run (or does not complete) on every path. This
is the same failure that produced the "~144 unflagged users" note in CLAUDE.md —
that number is now **378 unflagged users, 124 centers, 130 courses** in dev.

**Why it matters beyond tidiness:** `super_admin` is the role with unrestricted
platform reach. Forty-one active, non-demo, password-bearing accounts of that
role — created by scripts, owned by nobody, and invisible to the demo purge — is
a standing credential-surface problem. On dev today it is noise; the risk is a
fixture pattern that survives into a production bootstrap, or a dev database
being promoted.

**Shape of a fix (not applied):** flag fixture-created root users `is_demo = true`
so the existing purge reaches them, and/or give the DB test harness a guaranteed
teardown. Neither is a code change to make while the launch sequence is being
decided.

---

## Method note

The claim in item 1 was verified by reading `seed.ts` directly, not inferred from
a summary. The fixture-origin analysis in item 2 came from grouping
`users WHERE role = 'super_admin'` by email shape and creation date against the
**dev** database (`edura-env:dev`). Production holds zero users, so neither
finding describes production.
