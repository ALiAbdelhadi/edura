import { platformDb } from "../../db/scope";
import {
  computeLessonSplit,
  computeNoRoomLessonSplit,
  computeTeacherDirectSplit,
} from "../finance/fees";
import {
  EXAMPLE,
  FALLBACK_PLATFORM_CENTER_FEE,
  FALLBACK_PLATFORM_TEACHER_FEE,
  FALLBACK_TEACHER_DIRECT_BP,
  type PricingExamples,
  type PublicRates,
} from "@repo/shared/public-pricing";

export { EXAMPLE, type PricingExamples, type PublicRates } from "@repo/shared/public-pricing";

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

  const direct = computeTeacherDirectSplit(EXAMPLE.monthlySubscription, rates.teacherDirectBp);

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
