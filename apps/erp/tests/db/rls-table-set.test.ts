// DB-02 (SECURITY_AUDIT.md 2026-09-11) — the set of tables under row-level
// security is a deliberate list, not an accident of which migration ran. 41
// tables carry FORCE RLS; the other 43 (sessions, tokens, messages, ledgers,
// profiles, users…) rely on code-level scoping, which DB-01 explains. A table
// appearing or disappearing from this list is a policy change and must be a
// red test first — the same way `search-normalize` pins the `search_text` set.
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";

const admin = testPool();
let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { c ? (pass++, console.log("  ✓", m)) : (fail++, console.error("  ✗", m)); };

// Measured on the local test database 2026-09-11 (80 migrations).
const RLS_TABLES = [
  "attendance_records", "audit_logs", "blacklist_cascade_actions", "blacklist_entries",
  "center_admin_profiles", "center_shifts", "center_staff", "center_stages",
  "center_student_rosters", "center_teacher_affiliations", "center_wallet_ledger", "centers",
  "collaboration_requests", "conversation_groups", "conversations", "courses",
  "deletion_requests", "education_systems", "enrollment_requests", "enrollments", "expenses",
  "external_teacher_settlements", "grade_level_tracks", "grade_levels", "grades", "invoices",
  "materials", "payments", "payouts", "reviews", "rooms", "session_settlements", "stages",
  "subject_offerings", "subjects", "subscriptions", "teacher_agreements",
  "teacher_system_status_changes", "team_notes", "tracks", "transactions",
].sort();

async function main() {
  console.log("RLS table set (DB-02)");
  try {
    const rows = await admin.query<{ relname: string; relforcerowsecurity: boolean }>(
      `SELECT c.relname, c.relforcerowsecurity
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        ORDER BY 1`,
    );
    const live = rows.rows.map((r) => r.relname);
    const missing = RLS_TABLES.filter((t) => !live.includes(t));
    const extra = live.filter((t) => !RLS_TABLES.includes(t));
    ok(missing.length === 0, `every expected table still has RLS (missing: ${missing.join(", ") || "none"})`);
    ok(extra.length === 0, `no table gained RLS silently (extra: ${extra.join(", ") || "none"})`);
    ok(live.length === 41, `41 RLS tables (got ${live.length})`);
    const notForced = rows.rows.filter((r) => !r.relforcerowsecurity).map((r) => r.relname);
    ok(notForced.length === 0, `RLS is FORCE on all of them (not forced: ${notForced.join(", ") || "none"})`);
  } finally {
    await admin.end();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite rls-table-set.test.ts" })
  .then(() => main()).catch((e) => { console.error(e); process.exit(1); });
