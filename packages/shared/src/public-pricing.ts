// The public pricing page's code-default rates and worked-example inputs.
// Moved unchanged from @repo/server-core/services/pricing/public-rates.ts so the
// ERP can render the same fallback when the service cannot be reached.
export const FALLBACK_TEACHER_DIRECT_BP = 1500;
export const FALLBACK_PLATFORM_TEACHER_FEE = 200;
export const FALLBACK_PLATFORM_CENTER_FEE = 200;

export const EXAMPLE = {
  monthlySubscription: 50_000, // 500.00 EGP
  lessonPrice: 6_000, // 60.00 EGP
  presentStudents: 20,
} as const;

export type PublicRates = {
  teacherDirectBp: number;
  platformTeacherFee: number;
  platformCenterFee: number;
  split: { platformBp: number; teacherBp: number; centerBp: number } | null;
  live: boolean;
};

export type PricingExamples = {
  rates: PublicRates;
  teacherDirect: {
    price: number;
    platformCommission: number;
    teacherNet: number;
  };
  hallSplit: {
    lessonPrice: number;
    presentStudents: number;
    perStudent: { platform: number; center: number; teacher: number };
    sessionTotal: { platform: number; center: number; teacher: number };
  } | null;
  flatFee: {
    lessonPrice: number;
    platformTeacherFee: number;
    platformCenterFee: number;
    centerShare: number;
    teacherNet: number;
    centerNet: number;
  };
};
