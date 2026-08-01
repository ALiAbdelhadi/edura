import { platformDb } from "@/lib/db/scope";
import {
  computeLessonSplit,
  computeNoRoomLessonSplit,
  computeTeacherDirectSplit,
} from "@/lib/services/finance/fees";

/**
 * The numbers behind the public «إزاي بنحاسب» page.
 *
 * RULE: this module INVENTS NOTHING. Every rate is read from the live
 * `commission_settings` global row — the same row `resolveCommission()` and
 * `resolveRevenueSplit()` read when real money is settled — and every figure on
 * the page is produced by the SAME pure functions the settlement engine calls
 * (`computeTeacherDirectSplit`, `computeLessonSplit`, `computeNoRoomLessonSplit`).
 * So the worked example on the marketing page cannot show a split the engine
 * would not actually produce; changing the platform's rates in the back office
 * changes this page with no code edit.
 *
 * The ONE thing that is chosen here rather than read is the example's INPUTS
 * (a 500 EGP monthly subscription, a 60 EGP lesson, 20 attending students).
 * Those are illustration, are labelled as such in the copy, and are the only
 * numbers on the page that are not platform configuration.
 *
 * Fallbacks mirror `FALLBACK` in server-core/services/finance/commission.ts, so
 * an unreachable database degrades to the same values the engine would use —
 * never to a made-up number and never to a crash on a public page.
 */

const FALLBACK_TEACHER_DIRECT_BP = 1500;
const FALLBACK_PLATFORM_TEACHER_FEE = 200;
const FALLBACK_PLATFORM_CENTER_FEE = 200;

/** Illustration inputs — the only invented figures on the page. */
export const EXAMPLE = {
  /** Monthly subscription to an independent teacher. */
  monthlySubscription: 50_000, // 500.00 EGP
  /** One lesson's price for one student in a center course. */
  lessonPrice: 6_000, // 60.00 EGP
  /** Students who actually attended that lesson. */
  presentStudents: 20,
} as const;

export type PublicRates = {
  /** Platform commission on a teacher-direct subscription, in basis points. */
  teacherDirectBp: number;
  /** Flat per-present-student platform fees on a hall-less center course (piasters). */
  platformTeacherFee: number;
  platformCenterFee: number;
  /** Default 3-way hall split in basis points, or null when none is configured. */
  split: { platformBp: number; teacherBp: number; centerBp: number } | null;
  /** True when the values came from the database rather than the code fallback. */
  live: boolean;
};

export type PricingExamples = {
  rates: PublicRates;
  /** A — independent teacher, settled the moment the student pays. */
  teacherDirect: {
    price: number;
    platformCommission: number;
    teacherNet: number;
  };
  /** B — course in a center hall, default 3-way split, per attending student. */
  hallSplit: {
    lessonPrice: number;
    presentStudents: number;
    perStudent: { platform: number; center: number; teacher: number };
    sessionTotal: { platform: number; center: number; teacher: number };
  } | null;
  /** C — center course with no hall pricing: the flat two-sided platform fee. */
  flatFee: {
    lessonPrice: number;
    platformTeacherFee: number;
    platformCenterFee: number;
    centerShare: number;
    teacherNet: number;
    centerNet: number;
  };
};

async function readRates(): Promise<PublicRates> {
  try {
    const row = await platformDb((tx) =>
      tx.commissionSetting.findFirst({ where: { scope: "global" } }),
    );
    if (!row) throw new Error("no global commission row");
    return {
      teacherDirectBp: row.teacherDirectCommissionBp ?? FALLBACK_TEACHER_DIRECT_BP,
      platformTeacherFee: row.platformTeacherFee ?? FALLBACK_PLATFORM_TEACHER_FEE,
      platformCenterFee: row.platformCenterFee ?? FALLBACK_PLATFORM_CENTER_FEE,
      split:
        row.platformShareBp != null && row.teacherShareBp != null && row.centerShareBp != null
          ? {
              platformBp: row.platformShareBp,
              teacherBp: row.teacherShareBp,
              centerBp: row.centerShareBp,
            }
          : null,
      live: true,
    };
  } catch (cause) {
    // A public page must render even when the database is unreachable. Log the
    // real cause; show the engine's own fallback rates rather than nothing.
    console.error("[pricing] falling back to code default rates", cause);
    return {
      teacherDirectBp: FALLBACK_TEACHER_DIRECT_BP,
      platformTeacherFee: FALLBACK_PLATFORM_TEACHER_FEE,
      platformCenterFee: FALLBACK_PLATFORM_CENTER_FEE,
      split: null,
      live: false,
    };
  }
}

export async function getPricingExamples(): Promise<PricingExamples> {
  const rates = await readRates();

  // A — teacher-direct. Settled at PAYMENT time by the subscription service.
  const direct = computeTeacherDirectSplit(EXAMPLE.monthlySubscription, rates.teacherDirectBp);

  // B — hall course, Method 1. Reproduces distributeSessionRevenue's derivation
  // exactly: the platform's cut and the center's cut are basis points of the
  // per-session price, expressed THROUGH computeLessonSplit so the teacher's
  // figure is the same remainder the ledger writes.
  let hallSplit: PricingExamples["hallSplit"] = null;
  if (rates.split) {
    const price = EXAMPLE.lessonPrice;
    const platformCut = Math.round((price * rates.split.platformBp) / 10_000);
    const centerCut = Math.round((price * rates.split.centerBp) / 10_000);
    const { teacherNet, centerNet, platformNet } = computeLessonSplit(price, centerCut, {
      platformTeacherFee: platformCut,
      platformCenterFee: 0,
    });
    const n = EXAMPLE.presentStudents;
    hallSplit = {
      lessonPrice: price,
      presentStudents: n,
      perStudent: { platform: platformNet, center: centerNet, teacher: teacherNet },
      sessionTotal: {
        platform: platformNet * n,
        center: centerNet * n,
        teacher: teacherNet * n,
      },
    };
  }

  // C — center course with no hall pricing configured. `centerShare` is 0
  // because that is the real default (collaboration acceptance sets no flat
  // share), and the clamps in computeNoRoomLessonSplit are what decide the
  // final fees — including capping the center-side fee at a zero share.
  const noRoom = computeNoRoomLessonSplit(EXAMPLE.lessonPrice, 0, {
    platformTeacherFee: rates.platformTeacherFee,
    platformCenterFee: rates.platformCenterFee,
  });
  const flat = computeLessonSplit(EXAMPLE.lessonPrice, noRoom.centerShare, noRoom.fees);

  return {
    rates,
    teacherDirect: {
      price: EXAMPLE.monthlySubscription,
      platformCommission: direct.platformCommission,
      teacherNet: direct.teacherNet,
    },
    hallSplit,
    flatFee: {
      lessonPrice: EXAMPLE.lessonPrice,
      platformTeacherFee: noRoom.fees.platformTeacherFee,
      platformCenterFee: noRoom.fees.platformCenterFee,
      centerShare: noRoom.centerShare,
      teacherNet: flat.teacherNet,
      centerNet: flat.centerNet,
    },
  };
}
