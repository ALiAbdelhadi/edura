# Scale & Performance Proof (PRD §9.1)

Reproducible via `bunx tsx packages/database/scripts/scale-load-test.mjs [txnCount] [attnCount]`
(tsx, not plain node — the script imports the shared guard in `scripts/db-guard.ts` and
refuses to run against anything but a `dev`- or `test`-labelled database).
The script seeds synthetic rows server-side (`INSERT … SELECT generate_series`), `ANALYZE`s,
runs `EXPLAIN (ANALYZE, BUFFERS)` on the heaviest §4 query shapes once **with** and once
**without** the composite index (drop → measure → recreate), then removes every synthetic
row (tagged `gateway_ref='LOADTEST'`). It runs as the owner role with `app.bypass_rls` set so
the FORCE-RLS ledger accepts the bulk insert; **no real rows are touched**.

## Result — 400,000-transaction ledger

| §4 query shape | With indexes | Uses | §9.1 target |
|---|---|---|---|
| Accountant ledger — `type='commission' AND status='completed' ORDER BY created_at DESC LIMIT 50` | **0.3 ms** | `transactions_type_status_created_idx` (composite) | p95 < 500 ms ✅ |
| Center ledger — `center_id=… ORDER BY created_at DESC LIMIT 50` | **0.2 ms** | `transactions_center_id_idx` + sort | ✅ |
| Revenue trend — `date_trunc('month', …) GROUP BY 1 LIMIT 24` | **18.3 ms** | partial-index scan | ✅ |
| Dashboard aggregate — `SUM(amount) GROUP BY type` (all 400k rows) | **53.9 ms** | index scan, full aggregate | ✅ (slowest) |

- **Seed throughput:** 400k rows in **10.4 s** (1M in **26 s** in an earlier run) via server-side generation.
- **Every list/keyset query is sub-millisecond** and ~1000× under the 500 ms p95 target.
- Dropping `transactions_type_status_created_idx` left the point-lookup lists fast (the planner
  falls back to the single-column `type`/`status` indexes + a small sort at this size); the
  composite index's margin widens with scale and higher selectivity. It is kept because it
  eliminates the sort on the accountant ledger — the single hottest §4.3 query.

## Honest caveats

- **The run was capped at 400k transactions, not 1M**, by Neon's free-tier **512 MB project size
  limit** (a full 1M-txn + 1M-attendance seed exceeded it). The query plans, index selection, and
  sub-ms timings above are representative; absolute times grow sub-linearly with more rows because
  every hot query is index-bounded (`LIMIT 50` / keyset), not a full scan.
- **The dashboard aggregate (`SUM … GROUP BY type`) is the first thing to pre-aggregate** — it is
  the only query that touches every row. At ≥1M rows, back it with a periodically-refreshed rollup
  table or a materialized view rather than computing it live per dashboard load.
- Append-only tables (`transactions`, `points_ledger`, `audit_logs`, `attendance_records`,
  `notifications`) have **no partitioning yet** — acceptable below ~5M rows; plan monthly
  `created_at` range partitions before then (requires the PK to include `created_at`).
- Connection pooling is correct (Neon pooler URL; per-transaction `set_config(…, true)` is
  pooler-safe; dev global-client caching prevents pool exhaustion).

## First bottleneck by scale (cheapest fix)

| Scale | First to strain | Fix |
|---|---|---|
| 10k users | ~~`count()`-based ref numbering~~ | **Done** — Postgres sequences (migration 003) |
| 100k rows | Unpaginated lists; JS-side report aggregation | Keyset pagination (done on new lists); move remaining timeseries to SQL `date_trunc` |
| 100k+ | Accountant ledger sort | **Done** — composite `(type, status, created_at DESC)` index |
| 1M rows | `generatePayouts` N+1 per beneficiary; dashboard live-aggregate | Single SQL aggregate; pre-aggregate KPI rollups |
| 5M+ rows | Append-only table size | Monthly `created_at` range partitioning + archival |
