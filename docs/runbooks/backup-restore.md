# Runbook — Database backup & restore

> **Read this top-to-bottom once, now, while nothing is broken.** The middle of
> an incident is the wrong time to discover that `pg_dump` refuses to talk to
> the server, or that nobody has the decryption key.

**Last verified: 2026-08-02** (restore path only — the SCHEDULE IS OFF, see §3)
A real dump of the `dev` database was restored
into a scratch PostgreSQL server and passed 8/8 integrity checks. Evidence is in
[§ Verification log](#verification-log).

---

## 1. What protects the data

There are **two** independent mechanisms, and they fail in different ways. That
is the point of having both.

| | Neon PITR | Logical dumps (this runbook) |
|---|---|---|
| Granularity | Any second inside the window | Daily snapshot |
| Window | Neon plan's retention (7d on paid tiers) | 7 daily + 4 weekly ≈ 1 month |
| Speed to restore | Minutes (branch) | Tens of minutes |
| Survives a Neon account/billing/lockout problem | ❌ **No** | ✅ Yes |
| Survives a Neon-side incident | ❌ No | ✅ Yes |
| Readable without Neon | ❌ No | ✅ Yes — plain PostgreSQL |
| Selective ("just the payments table") | ❌ No | ✅ Yes (`pg_restore -t`) |

**Rule of thumb:** for anything that happened in the last few days *and* Neon is
healthy — use PITR, it is faster and loses less. For everything else, or when
Neon itself is the problem, use a dump.

---

## 2. Prerequisites (do this before you need it)

### PostgreSQL client version — the sharp edge

`pg_dump` **refuses** to dump a server newer than itself:

```
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 18.4; pg_dump version: 17.10
```

This is a hard stop, not a warning, and it is how the constraint was found.
Check what Neon is running and install a client **at least** that major:

```bash
psql "$DIRECT_URL" -tAc "SELECT current_setting('server_version')"
```

```bash
brew install postgresql@18
```

On Debian/Ubuntu use the PGDG repo (`postgresql-client-18`); the distro default
is usually several majors behind. `bun run db:backup` runs this check itself and
refuses with an actionable message rather than letting `pg_dump` fail cryptically.

### Secrets

Set these as **GitHub Actions repository secrets** (the nightly job) and keep a
copy in your password manager (manual runs):

| Secret | What it is |
|---|---|
| `BACKUP_DIRECT_URL` | **Unpooled** Neon connection string (the `DIRECT_URL`, not the `-pooler` one). The pooler cannot produce a consistent dump. |
| `BACKUP_AGE_RECIPIENT` | age **public** key. Safe to expose; it can only encrypt. |
| `BACKUP_AGE_IDENTITY` | age **private** key. The only thing that can read a backup. |
| `BACKUP_S3_BUCKET` | Bucket name. |
| `BACKUP_S3_ENDPOINT` | S3-compatible endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`). Omit for AWS S3. |
| `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` | Bucket credentials. Scope them to this bucket, write-only if the provider allows. |
| `BACKUP_S3_REGION` | `auto` for R2. |
| `BACKUP_ALERT_EMAIL` | Where a FAILED backup shouts. |

> ### ⚠️ Where the age private key must NOT live
> `BACKUP_AGE_IDENTITY` decrypts every backup you have. **Do not store it only
> in GitHub Secrets**, and **never in the same place as the backups themselves**
> — an attacker with the bucket and the key has everything, and so does a
> compromised CI runner.
>
> Store it in a password manager **and** on paper in a physical safe. It is
> unrecoverable: lose it and every backup is permanently unreadable.

### Setting all of this up

There is a script that does it. **You run it, not an assistant** — it prompts for
each value and pipes it straight into `gh secret set`, so nothing is echoed,
written to a file, or left in shell history:

```bash
bash packages/database/scripts/setup-backup-secrets.sh
```

It also generates the age key pair for you and refuses to move on until you
confirm you have stored the private key somewhere durable.

Prerequisites: `brew install gh age`, then `gh auth login`.

### Generate the age key pair manually (if you are not using the script)

```bash
age-keygen -o edura-backup.key
```

The output file contains the private key (`AGE-SECRET-KEY-1…` → `BACKUP_AGE_IDENTITY`)
and prints the public key (`age1…` → `BACKUP_AGE_RECIPIENT`).

### Bucket configuration

Create the bucket **private**, then:

1. **Versioning ON.** Protects against an attacker (or a script) overwriting a
   good backup with a bad one.
2. **Lifecycle rules** implement remote retention — the script only prunes
   *local* files:
   - `production/daily/` → expire after **8 days** (keeps 7, one spare)
   - `production/weekly/` → expire after **35 days** (keeps 4, one spare)
3. **Object Lock / immutability** if the provider supports it. A backup an
   intruder can delete is not a backup against ransomware.

---

## 3. Taking a backup

> ### ⚠️ AUTOMATIC BACKUPS ARE CURRENTLY OFF
> The schedule in `.github/workflows/backup.yml` was disabled on **2026-08-02**
> because the bucket and the `BACKUP_*` secrets do not exist yet. **Nothing is
> being backed up on a schedule right now** — the only protection in force is
> Neon PITR, inside its retention window.
>
> Re-enable by running `setup-backup-secrets.sh` (above), confirming a manual
> run passes, and restoring the `schedule:` block — the exact YAML to paste is
> in the comment at the top of the workflow file.

Once enabled: `.github/workflows/backup.yml` runs at 02:30 UTC (04:30 Cairo)
daily. Sunday's dump is written to **both** `daily/` and `weekly/`.

Manual:

```bash
bun run --filter @repo/database db:backup production
```

Local dump only, no upload — useful before a risky migration:

```bash
bun run --filter @repo/database db:backup production --local-only
```

The script will **refuse to upload an unencrypted dump**. That is deliberate: it
contains every user, every phone number, and every minor's name and grades.

It also verifies the `edura-env:` label *inside* the database before dumping, so
a stale connection string cannot file a production dump under `dev/`.

---

## 4. Restoring

### 4a. Rehearsal — verify a backup is good (no impact on anything)

```bash
# Decrypt first
age -d -i edura-backup.key -o restore.dump production-daily-2026-08-02....dump.enc

# Spin up a throwaway PostgreSQL, restore, run integrity checks, destroy it
bun run --filter @repo/database db:restore-test restore.dump
```

This touches **no** cloud database. It creates a temporary server in `$TMPDIR`
listening on a unix socket only, and deletes it afterwards. Pass `--keep` to
leave it running and poke around with `psql`.

Run this **before** any real restore. It takes about 30 seconds and tells you
whether the file you are about to depend on is worth depending on.

### 4b. Real restore — Neon PITR (preferred when Neon is healthy)

Fastest and loses the least. **Restore to a BRANCH first, never over production.**

1. Neon Console → project → **Branches** → *Create branch* → *from a point in time*.
2. Pick the timestamp just **before** the bad event.
3. Point a **scratch** app instance at the branch and confirm the data is right.
4. Only then promote: either repoint `DATABASE_URL`/`DIRECT_URL` at the branch,
   or copy the specific rows back.

⚠️ A new Neon branch **inherits its parent's `edura-env:` label**. If you make a
branch from production and intend it as scratch, relabel it immediately or the
guard scripts will treat it as production:

```sql
COMMENT ON DATABASE neondb IS 'edura-env:dev';
```

### 4c. Real restore — from a logical dump

```bash
# 1. Fetch and verify BEFORE trusting it
aws s3 cp s3://$BUCKET/production/daily/<file>.enc . --endpoint-url $ENDPOINT
age -d -i edura-backup.key -o restore.dump <file>.enc
shasum -a 256 restore.dump          # compare with the checksum the backup logged

# 2. Rehearse (§4a). Do not skip this.
bun run --filter @repo/database db:restore-test restore.dump

# 3. Restore into a NEW, EMPTY Neon branch — never over a live database
pg_restore --no-owner --no-privileges -d "$NEW_BRANCH_DIRECT_URL" restore.dump

# 4. Recreate the app role and grants (the dump carries neither)
bun run --filter @repo/database db:bootstrap-role
bun run --filter @repo/database db:verify      # expect 25/25
```

**Step 4 is not optional.** The dumps are taken with `--no-owner
--no-privileges`, so a restored database has the tables and the data but **not**
the `edura_app` role, its grants, or the REVOKEs that make the money ledger
append-only. Skipping it leaves a database where `transactions` is writable.
`db:verify` is what proves you did it.

### Selective restore (one table, not the world)

Usually what you actually want:

```bash
pg_restore --no-owner --data-only -t payments -d "$SCRATCH_URL" restore.dump
```

Restore into a **scratch** database, then copy the specific rows across by hand.
Never `--data-only` straight into production: it does not respect foreign-key
order and will leave the ledger inconsistent.

---

## 5. Retention

| Where | Kept | Enforced by |
|---|---|---|
| `production/daily/` | 7 | Bucket lifecycle rule (8-day expiry) |
| `production/weekly/` | 4 | Bucket lifecycle rule (35-day expiry) |
| Local `.backups/` | 7 / 4 | `backup-db.ts` prunes on each run |

Tune with `BACKUP_KEEP_DAILY` / `BACKUP_KEEP_WEEKLY` (local only — the bucket
rules are configured in the provider's console and must be changed there too).

---

## 6. When a backup fails

The job emails `BACKUP_ALERT_EMAIL` and the Actions run goes red. A scheduled
run with unset secrets **fails loudly** rather than passing green, because a
silently-skipped backup is indistinguishable from a healthy one on a dashboard.

| Symptom | Cause | Fix |
|---|---|---|
| `aborting because of server version mismatch` | Client older than the server | Install a matching major (§2) |
| `no ADMIN_URL or DIRECT_URL` | Only the pooled URL is set | Use the unpooled `DIRECT_URL` |
| `refusing to upload an UNENCRYPTED dump` | No age recipient / passphrase | Set `BACKUP_AGE_RECIPIENT` |
| `dump is only N bytes` | Dump aborted early | Check connectivity; re-run |
| `db-guard: expected production, found dev` | Connection string points elsewhere | Fix the secret — do **not** override the guard |
| `postmaster became multithreaded during startup` (restore test, macOS) | PostgreSQL 18 + macOS locale | Already handled: the script forces `LC_ALL=C` |
| `role "ali" does not exist` (restore test) | psql defaulting to the OS user | Already handled: the script passes `-U postgres` |

---

## 7. What is NOT covered

Stated plainly, because a runbook that implies more coverage than it has is
worse than one that admits its limits:

- **Cloudinary media** (center logos, teacher photos, materials) is **not** in
  these dumps. The database holds only URLs. Cloudinary keeps its own copies;
  there is no independent backup of that account today.
- **Neon's own configuration** — roles, branches, compute settings — is not
  captured. `db:bootstrap-role` recreates the app role; the rest is manual.
- **Secrets** are not backed up here, by design. They live in your password
  manager and the hosting provider.
- **RPO ≈ 24 hours** on the logical-dump path (best case ~0 with PITR inside its
  window). If that is too much, the next step is WAL archiving, not a more
  frequent `pg_dump`.

---

## Verification log

Append a row every time a restore is actually exercised. An entry older than a
month means the backups are once again a hypothesis.

| Date | Source | Method | Result |
|---|---|---|---|
| 2026-08-02 | `dev` (real dump, 0.32 MiB) | `db:restore-test` into a scratch PostgreSQL 18.4 server | ✅ **8/8** — 78 tables, 44 applied migrations, 45 subjects / 27 grade levels, 38 users, 0 orphaned refunds, 0 orphaned enrollments, 296 indexes / 45 FKs, 6 sequences |

**Caveat on that run, stated honestly:** the dev database had been wiped and
re-seeded, so it held **0 transactions and 0 payments**. The money-ledger check
therefore passed *vacuously* — it proved the tables restore and are readable,
not that a large ledger round-trips intact. The first production run will be the
first real exercise of that check.
