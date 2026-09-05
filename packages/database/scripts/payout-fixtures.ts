import "./load-env";
import { withPlatformContext } from "../src/index";

/**
 * Self-contained fixtures for the three payout proofs (H1, H2, teacher-payout-replay).
 *
 * WHY THESE EXIST. All three used to open on a hardcoded UUID and, when it was
 * absent, fall back to "any teacher_profiles row ORDER BY user_id LIMIT 1".
 * Two things were wrong with that:
 *
 *   1. THE HARDCODED ID WAS NEVER PRODUCED BY ANY SEED. `47b21cb0-…` is a
 *      UUIDv5, but `prisma/seed.ts` lets the database generate its ids, so the
 *      fallback was not a safety net -- it was the ONLY path ever taken, and a
 *      suite that says "(seed)" in its log had simply never been run.
 *   2. THE FALLBACK BORROWED SOMEONE ELSE'S ROW AND WROTE TO IT. These proofs
 *      overwrite `wallet_balance`, and H1 and the replay suite run
 *      `DELETE FROM payouts WHERE beneficiary_id = <borrowed> AND status IN
 *      ('pending','approved')`. On a shared database that silently destroys
 *      another suite's pending payouts, which is exactly the cross-suite
 *      interference that makes whole-table census assertions flap.
 *
 * So each proof now creates and owns everything it touches. Names and emails
 * carry the suite's tag, which is what `test-cleanup` sweeps on; payouts and
 * profiles follow by foreign key and by the `beneficiary_id` naming-convention
 * edge, so nothing is left behind.
 */

const rid = () => Math.floor(Math.random() * 1e9).toString(36);

export type TeacherFixture = { userId: string; tag: string };
export type CenterFixture = { centerId: string; adminId: string; tag: string };

/** A teacher user + profile owned by this suite, with a known wallet balance. */
export async function createTeacherFixture(
  tag: string,
  walletBalance = 0,
  key = "t",
): Promise<TeacherFixture> {
  const userId = await withPlatformContext(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: `${tag}-${key}`,
        email: `${tag}-${key}-${rid()}@x.io`,
        role: "teacher",
        status: "active",
      },
    });
    await tx.teacherProfile.create({
      data: { userId: user.id, subjects: ["Math"], walletBalance },
    });
    return user.id;
  });
  return { userId, tag };
}

/** A centre + its admin, owned by this suite, with a known wallet balance. */
export async function createCenterFixture(
  tag: string,
  walletBalance = 0,
): Promise<CenterFixture> {
  return withPlatformContext(async (tx) => {
    const center = await tx.center.create({
      data: {
        name: `${tag}-center`,
        shortId: `${tag}-${rid()}`.toUpperCase().slice(0, 20),
        subjects: ["Math"],
        status: "active",
        walletBalance,
      },
    });
    const admin = await tx.user.create({
      data: {
        name: `${tag}-ca`,
        email: `${tag}-ca-${rid()}@x.io`,
        role: "center_admin",
        status: "active",
      },
    });
    await tx.centerAdminProfile.create({ data: { userId: admin.id, centerId: center.id } });
    return { centerId: center.id, adminId: admin.id, tag };
  });
}
