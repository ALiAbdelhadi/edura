"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { InviteLink, type InviteDelivery } from "@/components/kit/invite-link";
import { Spinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { Button } from "@repo/ui/components/button";
import {
  Badge,
  EmptyState,
  Eyebrow,
  PageHead,
  RowIdentity,
  Sheet,
} from "./ledger";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { HTTPError } from "ky";
import { Lock, MailPlus, Plus, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

type StaffRole = "receptionist" | "manager" | "center_accountant";
const ROLES: StaffRole[] = ["receptionist", "manager", "center_accountant"];
const CAN: Record<StaffRole, string[]> = {
  receptionist: ["checkin", "walkin", "topup", "students"],
  manager: ["checkin", "walkin", "topup", "students", "rooms", "collaboration", "opsReports"],
  center_accountant: ["finance"],
};

type StaffRow = {
  id: string;
  staffUserId: string;
  role: StaffRole;
  title: string | null;
  active: boolean;
  createdAt: string;
  pendingClaim: boolean;
  user: { id: string; name: string; email: string | null; phone: string | null; status: string } | null;
};

export function CenterStaffScreen() {
  const t = useTranslations();
  const [rows, setRows] = useState<StaffRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await api.get("center/staff").json<{ data: StaffRow[] }>();
    setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (row: StaffRow, role: StaffRole) => {
    await api.patch(`center/staff/${row.id}`, { json: { role } });
    void load();
  };

  const setActive = async (row: StaffRow, active: boolean) => {
    await api.patch(`center/staff/${row.id}`, { json: { active } });
    void load();
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("centerStaff.title")}
        subtitle={t("centerStaff.subtitle")}
        actions={<AddStaffDialog onCreated={load} />}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Sheet className="order-2 overflow-hidden lg:order-1">
          {rows === null ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title={t("centerStaff.empty")}
              hint={t("centerStaff.emptyHint")}
            />
          ) : (
            <ul className="m-0 list-none p-0">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 border-b border-[var(--rule-2)] px-4 py-3 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <RowIdentity
                      name={
                        <span className="flex items-center gap-2">
                          <span className="truncate">{row.user?.name ?? "—"}</span>
                          {row.title ? (
                            <Badge tone="neutral">{row.title}</Badge>
                          ) : null}
                          {row.pendingClaim ? (
                            <Badge tone="pending">{t("centerStaff.pendingInvite")}</Badge>
                          ) : null}
                        </span>
                      }
                      initialsFrom={row.user?.name ?? "?"}
                      meta={row.user?.email ?? row.user?.phone ?? ""}
                    />
                  </div>

                  <Select
                    value={row.role}
                    onValueChange={(v) => void changeRole(row, v as StaffRole)}
                    disabled={!row.active}
                  >
                    <SelectTrigger
                      className="w-40 border-[var(--rule)] bg-[var(--field)]"
                      aria-label={t("centerStaff.role")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {t(`centerStaff.roleName.${r}` as Parameters<typeof t>[0])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Badge tone={row.active ? "done" : "neutral"}>
                    {row.active ? t("centerStaff.active") : t("centerStaff.inactive")}
                  </Badge>

                  {row.pendingClaim && row.active ? <ResendInviteButton row={row} /> : null}

                  <ConfirmDialog
                    trigger={
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={row.active ? "text-destructive" : "text-[var(--teal)]"}
                      >
                        {row.active ? t("centerStaff.deactivate") : t("centerStaff.activate")}
                      </Button>
                    }
                    title={row.active ? t("centerStaff.deactivateTitle") : t("centerStaff.activateTitle")}
                    description={
                      row.active
                        ? t("centerStaff.deactivateDescription", { name: row.user?.name ?? "" })
                        : t("centerStaff.activateDescription", { name: row.user?.name ?? "" })
                    }
                    confirmText={row.active ? t("centerStaff.deactivate") : t("centerStaff.activate")}
                    cancelText={t("actions.cancel")}
                    destructive={row.active}
                    onConfirm={() => void setActive(row, !row.active)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Sheet>
        <RolePermissionsPanel />
      </div>
    </div>
  );
}

function RolePermissionsPanel() {
  const t = useTranslations();
  const [role, setRole] = useState<StaffRole>("receptionist");
  return (
    <Sheet className="order-1 flex flex-col gap-3.5 p-4 lg:order-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-[var(--indigo)]" />
        <Eyebrow>{t("centerStaff.permissionsTitle")}</Eyebrow>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRole(r)}
            aria-pressed={r === role}
            className={`h-8 rounded-lg px-3 text-[13px] font-semibold transition-colors ${
              r === role
                ? "bg-[var(--indigo)] text-[var(--indigo-ink)]"
                : "border border-[var(--rule)] bg-[var(--field)] text-[var(--ink-2)] hover:bg-[var(--rule-2)]"
            }`}
          >
            {t(`centerStaff.roleName.${r}` as Parameters<typeof t>[0])}
          </button>
        ))}
      </div>

      <p className="m-0 text-xs leading-relaxed text-[var(--ink-2)]">
        {t(`centerStaff.roleDesc.${role}` as Parameters<typeof t>[0])}
      </p>

      <ul className="m-0 flex list-none flex-col p-0">
        {CAN[role].map((cap) => (
          <li
            key={cap}
            className="border-b border-[var(--rule-2)] py-2 text-[13px] text-[var(--ink)] last:border-b-0"
          >
            {t(`centerStaff.can.${cap}` as Parameters<typeof t>[0])}
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-2 rounded-lg border border-destructive bg-[var(--red-soft)] p-3">
        <Lock className="mt-px size-3.5 shrink-0 text-destructive" />
        <span className="text-xs leading-relaxed text-destructive">
          {t("centerStaff.excluded")}
        </span>
      </div>
      <p className="m-0 text-[11px] text-[var(--ink-3)]">{t("centerStaff.auditNote")}</p>
    </Sheet>
  );
}

function AddStaffDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("receptionist");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<
    { claimLink: string; delivery: InviteDelivery; to: string } | null
  >(null);

  const reset = () => {
    setName("");
    setEmail("");
    setRole("receptionist");
    setTitle("");
    setError(null);
    setInvite(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api
        .post("center/staff", {
          json: { name, email, role, ...(title.trim() ? { title } : {}) },
        })
        .json<{
          data?: { invite?: { claimLink: string; delivery: InviteDelivery } | null };
        }>();
      await onCreated();
      if (res?.data?.invite) {
        setInvite({
          claimLink: res.data.invite.claimLink,
          delivery: res.data.invite.delivery,
          to: email,
        });
      } else {
        setOpen(false);
        reset();
      }
    } catch (err) {
      if (err instanceof HTTPError) {
        const body = (err.data ?? null) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? t("centerStaff.createFailed"));
      } else {
        setError(t("centerStaff.createFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" className="gap-1">
          <Plus className="size-4" />
          {t("centerStaff.add")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("centerStaff.add")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-name">{t("centerStaff.name")}</Label>
            <Input id="staff-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-email">{t("centerStaff.email")}</Label>
            <Input
              id="staff-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("centerStaff.role")}</Label>
            <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
              <SelectTrigger aria-label={t("centerStaff.role")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`centerStaff.roleName.${r}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t(`centerStaff.roleDesc.${role}` as Parameters<typeof t>[0])}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staff-title">{t("centerStaff.roleTitle")}</Label>
            <Input
              id="staff-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("centerStaff.roleTitlePlaceholder")}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("centerStaff.inviteNote")}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {invite ? (
            <InviteLink link={invite.claimLink} delivery={invite.delivery} to={invite.to} />
          ) : null}
        </div>
        <DialogFooter>
          {invite ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                reset();
              }}
            >
              {t("invite.done")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={submit}
              disabled={saving || !name.trim() || !email.trim()}
            >
              {saving ? <Spinner /> : null}
              {t("centerStaff.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResendInviteButton({ row }: { row: StaffRow }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<
    { claimLink: string; delivery: InviteDelivery } | null
  >(null);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api
        .post(`center/staff/${row.id}/invite`, { json: {} })
        .json<{ data?: { claimLink: string; delivery: InviteDelivery } }>();
      if (res?.data) setInvite(res.data);
    } catch (err) {
      if (err instanceof HTTPError) {
        const body = (err.data ?? null) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? t("centerStaff.resendFailed"));
      } else {
        setError(t("centerStaff.resendFailed"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setInvite(null);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1">
          <MailPlus className="size-3.5" />
          {t("centerStaff.resendInvite")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("centerStaff.resendInvite")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t("centerStaff.resendBody", { name: row.user?.name ?? "" })}
          </p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {invite ? (
            <InviteLink
              link={invite.claimLink}
              delivery={invite.delivery}
              to={row.user?.email}
            />
          ) : null}
        </div>
        <DialogFooter>
          {invite ? (
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t("invite.done")}
            </Button>
          ) : (
            <Button type="button" onClick={send} disabled={busy}>
              {busy ? <Spinner /> : null}
              {t("centerStaff.resendInvite")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
