/**
 * Names of the partial / expression unique indexes that Prisma cannot model, so
 * the code that relies on them names them in exactly one place.
 *
 * Prisma's schema language has no partial index and no expression index, so
 * these live only in migration SQL. That means `prisma migrate dev` will offer
 * to drop them as drift -- do not accept it. What actually guards them is
 * `tests/db/c04-dedupe-guards.test.ts`, which asserts all three exist, are
 * unique and are valid, and proves each one bites under a real concurrent race.
 *
 * Created by migration 20260902120000_dedupe_guards (AUDIT_REPORT.md C-4).
 */
export const AFFILIATION_ONE_LIVE = "center_teacher_affiliation_one_live";
export const PARENT_LINK_ONE_LIVE = "parent_student_link_one_live";
export const WALLET_SETTINGS_ONE_ROW = "wallet_settings_one_row";

/**
 * At most one `active` agreement per (center, teacher).
 *
 * Older than the three above -- created by migration
 * 20260825200000_teacher_agreements, not by the dedupe-guards one -- but named
 * here for the same reason: `approveAgreementTx` races on it and needs to turn
 * its P2002 into a domain message rather than a bare 409.
 */
export const AGREEMENT_ONE_ACTIVE_PER_PAIR = "teacher_agreements_one_active_per_pair";

/**
 * One active ban per (target, level key), and one pending agreement proposal
 * per (centre, teacher). Created by migration 20260905120000_dedupe_guards_c5
 * (MIGRATION_PLAN_C5.md); enforced by tests/db/c05-dedupe-guards.test.ts.
 */
export const BLACKLIST_PLATFORM_ONE_ACTIVE = "blacklist_platform_one_active";
export const BLACKLIST_CENTER_ONE_ACTIVE = "blacklist_center_one_active";
export const BLACKLIST_TEACHER_ONE_ACTIVE = "blacklist_teacher_one_active";
export const AGREEMENT_ONE_PROPOSED_PER_PAIR = "teacher_agreements_one_proposed_per_pair";
