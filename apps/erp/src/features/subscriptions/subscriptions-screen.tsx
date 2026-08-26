"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PageSpinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { asArray } from "@/lib/refine/as-array";
import {
  Hairline,
  InitialsTile,
  LedgerButton,
  LedgerEmpty,
  Money,
  Num,
  PageTitle,
  SectionHeading,
  Sheet,
} from "@/components/ledger";
import { isLive, stateOf, type SubscriptionRow } from "./subscription-state";
import { SubscriptionStateChip, useCoverageWords } from "./subscription-state-chip";

/**
 * اشتراكاتي — the answer to "الاشتراك خلص؟", for a student about themselves or
 * a parent about one child.
 *
 * ── ONE SCREEN, TWO AUDIENCES ─────────────────────────────────────────────
 *
 * `GET /me/subscriptions` has been student- AND parent-scoped since Step 4 —
 * a parent passes `?studentId=` and the service checks the approved link. The
 * rows are therefore identical and only the sentences differ, so the audience
 * arrives as props rather than as a role check buried in the component. Same
 * shape as `LatestGradeCard`.
 *
 * The neutral vocabulary — states, plans, countdowns, section headings — reads
 * from `shared.subscriptions`; see `subscription-state-chip.tsx` for why it is
 * not in either portal's namespace.
 *
 * ── WHY THIS IS A PAGE AND NOT A SECTION OF THE WALLET ────────────────────
 *
 * The wallet answers "how much money do I have"; this answers "can I walk into
 * my lesson on Saturday". They are both money-shaped and they are not the same
 * question, and the second one is asked far more often. Folding it into the
 * wallet would also have put it under a hundred-row ledger, which is where the
 * receipts already are and the reason nobody finds them.
 *
 * ── ROWS, NOT A TABLE ─────────────────────────────────────────────────────
 *
 * Course, plan, coverage, state and price is five columns, and this portal is
 * read on a 375px phone. Five columns at that width is either a horizontal
 * scroll or five illegible ones, so each subscription is a row that stacks.
 *
 * ── IT WRITES NOTHING ─────────────────────────────────────────────────────
 *
 * Reads `GET /me/subscriptions` and stops. "جدّد" is a link into the existing
 * Subjects checkout — the one money path, unchanged. There is deliberately no
 * cancel button here: `cancelPendingSubscription` only ever accepts an unpaid
 * row, and a control that is refused for almost every row it sits on teaches
 * people the app is broken.
 */
function SubscriptionRowView({
  sub,
  renewHref,
}: {
  sub: SubscriptionRow;
  renewHref: string;
}) {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const words = useCoverageWords();

  const state = stateOf(sub);
  const coverage = words(state);
  const title = sub.course?.title ?? t("studentClass.tbd");
  const needsRenewal = state.kind === "expiring" || state.kind === "lapsed";

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <InitialsTile name={title} size={34} tone={isLive(state) ? "teal" : "indigo"} />
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug" style={{ color: "var(--ink)" }}>
            {title}
          </p>
          <p className="mt-0.5 text-xs" style={{ color: "var(--ink-3)" }}>
            {sub.plan === "monthly"
              ? t("shared.subscriptions.planMonthly")
              : t("shared.subscriptions.planSession")}
            {" · "}
            {/* THE PLAN DECIDES WHAT THE MISSING WINDOW MEANS, and the order of
                these branches is the whole point. Reading "no periodEnd" as
                "covers one session" was true for a per-session pass and a lie
                for a monthly one that has not been paid for yet: an unpaid
                MONTHLY row rendered as "بيغطي حصة واحدة بس", which is a
                statement about coverage the student never bought.

                The window itself is printed, not only the countdown — someone
                about to argue with a receptionist needs the date. */}
            {sub.plan === "per_session" ? (
              t("shared.subscriptions.noWindow")
            ) : sub.periodEnd ? (
              <>
                {t("shared.subscriptions.endsOn")}{" "}
                {/* NOT wrapped in <Num>. This date carries the month as a WORD
                    ("٢٣ أغسطس"), and <Num> is a dir="ltr" isolate for figures —
                    it put the Arabic month first and the day after it, which is
                    not how anyone writes a date in Arabic. Same reason the
                    Ledger's own clock lifts the day period out of its isolate.
                    A numeric date is fine in <Num>; a date with prose in it is
                    not. */}
                {formatDate(sub.periodEnd, { day: "numeric", month: "long" })}
              </>
            ) : (
              t("shared.subscriptions.notStarted")
            )}
          </p>
          {coverage ? (
            <p className="mt-1 text-xs" style={{ color: "var(--ink-2)" }}>
              {coverage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
        <div className="flex items-center gap-2">
          <SubscriptionStateChip state={state} />
          {/* The price is a snapshot taken at checkout, so it is the amount
              actually paid for THIS period — never a live price. */}
          <Money piasters={sub.price} tone="ink" weight={600} />
        </div>
        {needsRenewal ? (
          <LedgerButton variant="primary" asChild>
            <Link href={renewHref}>{t("shared.subscriptions.renew")}</Link>
          </LedgerButton>
        ) : null}
      </div>
    </div>
  );
}

export function SubscriptionsScreen({
  studentId,
  title,
  subtitle,
  emptyTitle,
  emptyHint,
  emptyCta,
  renewHref,
}: {
  /** A parent reading one approved child. Omitted for the caller's own rows. */
  studentId?: string;
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyHint: string;
  emptyCta: string;
  /** Where "جدّد" goes — Subjects for a student, Pay for a parent. */
  renewHref: string;
}) {
  const t = useTranslations();
  const { query, result } = useCustom({
    url: studentId ? `me/subscriptions?studentId=${studentId}` : "me/subscriptions",
    method: "get",
  });

  // `asArray`, not `?? []` — refine hands back a frozen `{}` until the request
  // settles, and `{}.filter` throws on the first render.
  const subs = asArray<SubscriptionRow>(result?.data);

  if (query.isLoading) return <PageSpinner label={t("common.loading")} />;

  const live = subs.filter((s) => isLive(stateOf(s)));
  const past = subs.filter((s) => !isLive(stateOf(s)));

  return (
    <div className="space-y-6">
      <PageTitle title={title} subtitle={subtitle} />

      <Sheet className="p-5">
        <SectionHeading
          title={t("shared.subscriptions.sectionActive")}
          action={
            live.length > 0 ? (
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{live.length}</Num>
            ) : null
          }
        />
        <div className="mt-3">
          {live.length === 0 ? (
            <LedgerEmpty
              title={emptyTitle}
              hint={emptyHint}
              action={
                <LedgerButton variant="primary" asChild>
                  <Link href={renewHref}>{emptyCta}</Link>
                </LedgerButton>
              }
            />
          ) : (
            <ul>
              {live.map((sub, i) => (
                <li key={sub.id}>
                  {i > 0 ? <Hairline /> : null}
                  <SubscriptionRowView sub={sub} renewHref={renewHref} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {/* Past subscriptions are a record, not a prompt — so they are here, in
          full, and never in the alert on the home screen. */}
      {past.length > 0 ? (
        <Sheet className="p-5">
          <SectionHeading
            title={t("shared.subscriptions.sectionPast")}
            action={
              <Num style={{ color: "var(--ink-3)", fontSize: 13 }}>{past.length}</Num>
            }
          />
          <div className="mt-3">
            <ul>
              {past.map((sub, i) => (
                <li key={sub.id}>
                  {i > 0 ? <Hairline /> : null}
                  <SubscriptionRowView sub={sub} renewHref={renewHref} />
                </li>
              ))}
            </ul>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
