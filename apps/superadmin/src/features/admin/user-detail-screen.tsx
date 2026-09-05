"use client";

import { useState } from "react";
import { useCustom } from "@refinedev/core";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import {
  ArrowLeft,
  Ban,
  Building2,
  CircleCheck,
  ExternalLink,
  KeyRound,
  LogOut,
  Monitor,
  RefreshCcw,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  TriangleAlert,
  UserRoundCheck,
  UserRoundCog,
} from "lucide-react";

import { Button } from "@repo/ui/components/button";
import { Num } from "@repo/ui/components/num";
import { StatusBadge, statusTone } from "@repo/ui/components/status-badge";
import { toast } from "@repo/ui/components/sonner";
import type { Locale } from "@repo/ui/lib/format";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { ReasonDialog } from "@/components/kit/reason-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { deviceLabel } from "@/features/security/security-screen";
import { Link } from "@/i18n/navigation";
import { asKey } from "@/lib/i18n/keys";
import { useAction } from "@/lib/api/use-action";
import { StudentCardPanel } from "./student-card-panel";

type UserDetail = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  locale: string | null;
  emailVerified: boolean | null;
  twoFactorEnabled: boolean | null;
  tokenVersion: number;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

type SessionRow = {
  id: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  impersonatedBy: string | null;
};

type CenterRow = { id: string; name: string; status: string } | null;

export type ReasonAction =
  | "suspend"
  | "reinstate"
  | "blacklist"
  | "revokeAll"
  | "reset2fa"
  | "passwordReset"
  | "reissueCard"
  | "revokeCard";

export const RESTORATIVE: ReadonlySet<ReasonAction> = new Set(["reinstate", "reissueCard"]);

const ERP_ROLES: ReadonlySet<string> = new Set([
  "center_admin",
  "center_staff",
  "teacher",
  "assistant",
  "parent",
  "student",
]);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-ink-3">{label}</span>
      <span className="text-[13px] text-ink">{children}</span>
    </div>
  );
}

export function UserDetailScreen({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers");
  const tg = useTranslations();
  const locale = useLocale() as Locale;
  const format = useFormatter();
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);

  const req = useCustom({ url: `admin/users/${userId}`, method: "get" });
  const data = req.result?.data as
    | { user: UserDetail; sessions: SessionRow[]; center: CenterRow }
    | undefined;

  const user = data?.user;
  const sessions = data?.sessions ?? [];
  const center = data?.center ?? null;

  // One instance, so `busy` disables every action on the page while any of
  // them is in flight — and `rethrow` keeps ReasonDialog/ConfirmDialog open on
  // failure, which is their contract.
  const { run, busy } = useAction<{ claimUrl?: string; token?: string }>({
    rethrow: true,
    onSuccess: () => req.query.refetch(),
  });

  // Card actions are also ReasonActions, but their dialog belongs to
  // StudentCardPanel — this map covers exactly the ones this screen raises.
  type AccountAction = Exclude<ReasonAction, "reissueCard" | "revokeCard">;
  const REASONED: Record<AccountAction, { url: string; method: "post" | "patch"; toast: string }> = {
    suspend: { url: "status", method: "patch", toast: "suspendedToast" },
    // A platform blacklist is NOT a second suspension path: it cascades to the
    // account's enrolments and writes a blacklist entry that the Blacklist
    // screen can lift. users.status is still the one mechanism that disables.
    blacklist: { url: "blacklist", method: "post", toast: "blacklistedToast" },
    reinstate: { url: "status", method: "patch", toast: "reinstatedToast" },
    revokeAll: { url: "revoke-sessions", method: "post", toast: "sessionsRevokedToast" },
    reset2fa: { url: "reset-2fa", method: "post", toast: "twoFactorResetToast" },
    passwordReset: { url: "password-reset", method: "post", toast: "passwordResetToast" },
  };

  const runReasoned = async (action: ReasonAction, reason: string) => {
    const spec = REASONED[action as AccountAction];
    await run({
      url: `admin/users/${userId}/${spec.url}`,
      method: spec.method,
      values:
        spec.url === "status"
          ? { suspended: action === "suspend", reason }
          : { reason },
      successMsg: t(asKey(spec.toast)),
    });
  };

  const revokeOne = async (sessionId: string) => {
    await run({
      url: `admin/users/${userId}/sessions/${sessionId}`,
      method: "delete",
      values: {},
      successMsg: t("sessionRevokedToast"),
    }).catch(() => undefined);
  };

  const impersonate = async () => {
    await run({ url: `admin/users/${userId}/impersonate`, values: {} });
    window.location.href = "/dashboard";
  };

  const viewAs = async () => {
    try {
      const res = await run({ url: `admin/users/${userId}/view-as`, values: {} });
      const claimUrl = res.ok ? res.data?.claimUrl : undefined;
      const token = res.ok ? res.data?.token : undefined;
      // An empty Error() here used to surface as the generic "action failed".
      if (!claimUrl || !token) throw new Error(t("viewAsNoHandoff"));

      // Open the target window FIRST: if the browser blocks it, submit() would
      // be a silent no-op and the operator would think view-as worked. Posting
      // into the named window we just opened also avoids a second flashed tab.
      const handoffWindow = window.open("", "edura-view-as");
      if (!handoffWindow) throw new Error(t("viewAsPopupBlocked"));

      const form = document.createElement("form");
      form.method = "POST";
      form.action = claimUrl;
      form.target = "edura-view-as";
      const field = document.createElement("input");
      field.type = "hidden";
      field.name = "token";
      field.value = token;
      form.appendChild(field);
      document.body.appendChild(form);
      form.submit();
      form.remove();
    } catch (e) {
      // `run` already toasted an API failure; this catches the two local
      // guards above (no handoff, popup blocked), which have no server error.
      if (!(e as { localized?: boolean })?.localized) {
        toast.error((e as { message?: string })?.message || t("actionFailed"));
      }
      throw e;
    }
  };

  const canViewAs =
    !!user &&
    user.status === "active" &&
    ERP_ROLES.has(user.role);

  const canImpersonate = user?.role === "accountant" && user?.status === "active";

  if (req.query.isLoading) return <PageSpinner label={tg("common.loading")} />;

  if (req.query.isError || !user) {
    const denied = (req.query.error as { statusCode?: number } | null)?.statusCode === 403;
    return (
      <div className="flex w-full flex-col gap-5">
        <EmptyState
          tone={denied ? "denied" : "error"}
          icon={TriangleAlert}
          title={t(denied ? "deniedTitle" : "loadError")}
          description={t(denied ? "deniedBody" : "loadErrorBody")}
          action={
            denied ? undefined : (
              <Button variant="outline" onClick={() => req.query.refetch()}>
                <RefreshCcw className="size-4" aria-hidden="true" />
                {t("retry")}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const suspended = user.status === "suspended";
  const blacklisted = user.status === "blacklisted";

  return (
    <div className="flex w-full max-w-[820px] flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="self-start">
        <Link href="/dashboard/superadmin/users">
          <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          {t("backToList")}
        </Link>
      </Button>

      <PageHeader
        title={user.name ?? user.email ?? t("unnamed")}
        description={t("recordSubtitle")}
        rule
      />

      <section className="rounded-xl border border-rule bg-sheet p-4">
        <h2 className="text-[15px] font-bold text-ink">{t("identityTitle")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label={t("fieldRole")}>
            <StatusBadge tone="neutral">{tg(asKey(`roles.${user.role}`))}</StatusBadge>
          </Field>
          <Field label={t("fieldStatus")}>
            <StatusBadge tone={statusTone(user.status)}>
              {tg(asKey(`status.${user.status}`))}
            </StatusBadge>
            {user.isDemo ? (
              <StatusBadge tone="active" className="ms-1.5">
                {t("demo")}
              </StatusBadge>
            ) : null}
          </Field>
          <Field label={t("fieldEmail")}>
            {user.email ? (
              <span className="flex items-center gap-1.5">
                <Num.Code>{user.email}</Num.Code>
                {user.emailVerified ? (
                  <CircleCheck className="size-3.5 text-teal" aria-label={t("verified")} />
                ) : (
                  <span className="text-[11px] text-ink-3">{t("notVerified")}</span>
                )}
              </span>
            ) : (
              "—"
            )}
          </Field>
          <Field label={t("fieldPhone")}>
            {user.phone ? <Num.Code>{user.phone}</Num.Code> : "—"}
          </Field>
          <Field label={t("fieldTwoFactor")}>
            {user.twoFactorEnabled ? (
              <span className="flex items-center gap-1.5 text-teal">
                <ShieldCheck className="size-4" aria-hidden="true" />
                {t("twoFactorOn")}
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-ink-3">
                <ShieldOff className="size-4" aria-hidden="true" />
                {t("twoFactorOff")}
              </span>
            )}
          </Field>
          <Field label={t("fieldLocale")}>{user.locale ?? "—"}</Field>
          <Field label={t("fieldJoined")}>
            <Num.Date value={user.createdAt} locale={locale} />
          </Field>
          <Field label={t("fieldSessionEpoch")}>
            <Num.Figure value={user.tokenVersion} locale={locale} />
          </Field>
          <Field label={t("fieldId")}>
            <Num.Code>{user.id}</Num.Code>
          </Field>
          {user.deletedAt ? (
            <Field label={t("fieldDeletedAt")}>
              <span className="text-red">
                <Num.Date value={user.deletedAt} locale={locale} />
              </span>
            </Field>
          ) : null}
        </div>
      </section>

      {center ? (
        <section className="rounded-xl border border-rule bg-sheet p-4">
          <h2 className="text-[15px] font-bold text-ink">{t("centerTitle")}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rule-2">
              <Building2 className="size-4.5 text-ink-2" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-ink">{center.name}</p>
              <StatusBadge tone={statusTone(center.status)}>
                {tg(asKey(`status.${center.status}`))}
              </StatusBadge>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/superadmin/centers/${center.id}`}>
                {t("openCenter")}
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      {user.role === "student" ? <StudentCardPanel userId={userId} /> : null}

      <section className="rounded-xl border border-rule bg-sheet p-4">
        <h2 className="text-[15px] font-bold text-ink">{t("actionsTitle")}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{t("actionsDesc")}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant={suspended ? "default" : "destructive"}
            disabled={busy || blacklisted}
            onClick={() => setReasonAction(suspended ? "reinstate" : "suspend")}
          >
            {suspended ? (
              <UserRoundCheck className="size-4" aria-hidden="true" />
            ) : (
              <Ban className="size-4" aria-hidden="true" />
            )}
            {t(suspended ? "actionReinstate" : "actionSuspend")}
          </Button>

          <Button
            type="button"
            variant="destructive"
            disabled={busy || blacklisted}
            onClick={() => setReasonAction("blacklist")}
          >
            <ShieldBan className="size-4" aria-hidden="true" />
            {blacklisted ? t("actionBlacklisted") : t("actionBlacklist")}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setReasonAction("revokeAll")}
          >
            <LogOut className="size-4" aria-hidden="true" />
            {t("actionRevokeAll")}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy || !user.twoFactorEnabled}
            onClick={() => setReasonAction("reset2fa")}
          >
            <ShieldOff className="size-4" aria-hidden="true" />
            {t("actionReset2fa")}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => setReasonAction("passwordReset")}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            {t("actionPasswordReset")}
          </Button>

          {canImpersonate ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" disabled={busy}>
                  <UserRoundCog className="size-4" aria-hidden="true" />
                  {t("actionImpersonate")}
                </Button>
              }
              title={t("confirm_impersonate_title")}
              description={t("confirm_impersonate_body")}
              onConfirm={impersonate}
            />
          ) : null}

          {canViewAs ? (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="outline" disabled={busy}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  {t("actionViewAs")}
                </Button>
              }
              title={t("confirm_viewAs_title")}
              description={t("confirm_viewAs_body")}
              onConfirm={viewAs}
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-rule bg-sheet p-4">
        <h2 className="text-[15px] font-bold text-ink">{t("sessionsTitle")}</h2>
        <p className="mt-1 text-[13px] text-ink-2">{t("sessionsDesc")}</p>
        {sessions.length === 0 ? (
          <p className="mt-3 text-[12px] text-ink-3">{t("noSessions")}</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-rule">
            {sessions.map((s) => {
              const { label, mobile } = deviceLabel(s.userAgent, t("unknownDevice"));
              const Icon = mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-rule-2">
                    <Icon className="size-4.5 text-ink-2" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {label}
                      {s.impersonatedBy ? (
                        <span className="ms-2 rounded bg-amber-soft px-1.5 py-0.5 text-[11px] font-bold text-amber">
                          {t("impersonatedSession")}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-[12px] text-ink-3" dir="ltr">
                      {s.ipAddress || "—"} ·{" "}
                      <span dir="auto">
                        {t("lastActive")}{" "}
                        {format.dateTime(new Date(s.updatedAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => void revokeOne(s.id)}
                  >
                    <LogOut className="size-3.5" aria-hidden="true" />
                    {t("revokeSession")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {reasonAction ? (
        <ReasonDialog
          key={reasonAction}
          open
          onOpenChange={(o) => !o && setReasonAction(null)}
          title={t(asKey(`confirm_${reasonAction}_title`))}
          description={t(asKey(`confirm_${reasonAction}_body`))}
          confirmText={t("confirm")}
          destructive={!RESTORATIVE.has(reasonAction)}
          onConfirm={(reason) => runReasoned(reasonAction, reason)}
        >
          <p className="text-[11px] text-ink-3">{t("reasonHint")}</p>
        </ReasonDialog>
      ) : null}
    </div>
  );
}
