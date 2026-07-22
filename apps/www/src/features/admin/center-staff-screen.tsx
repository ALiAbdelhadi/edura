"use client";

// Center staff management (owner-only). Folds in the colleague's "سجل الموظفين"
// registry design — staff table + status badges + a side role-permissions panel
// + the Zero-Trust exclusions note — rendered in @repo/ui / Tailwind v4 / RTL.
// Preset roles (receptionist / manager / center_accountant), NOT free-form
// permission toggles: the panel shows each role's FIXED capability set.
import React, { useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck, Users, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { HTTPError } from "ky";
import { Card } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Badge } from "@repo/ui/components/badge";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { PageHeader } from "@/components/kit/page-header";
import { EmptyState } from "@/components/kit/empty-state";
import { Spinner } from "@/components/kit/spinner";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { PasswordInput } from "@/components/kit/password-input";
import { api } from "@/lib/api/client";

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
  user: { id: string; name: string; email: string | null; phone: string | null; status: string } | null;
};

function roleBadgeVariant(role: StaffRole): "default" | "secondary" | "outline" {
  return role === "manager" ? "default" : role === "center_accountant" ? "outline" : "secondary";
}

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
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("centerStaff.title")}
        description={t("centerStaff.subtitle")}
        actions={<AddStaffDialog onCreated={load} />}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Staff registry */}
        <Card className="order-2 p-0 lg:order-1">
          {rows === null ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-8">
              <EmptyState
                icon={Users}
                title={t("centerStaff.empty")}
                description={t("centerStaff.emptyHint")}
              />
            </div>
          ) : (
            <ul>
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
                >
                  <Avatar>
                    <AvatarFallback>
                      {(row.user?.name ?? "?").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-foreground">
                        {row.user?.name ?? "—"}
                      </p>
                      {row.title ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {row.title}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground" dir="ltr">
                      {row.user?.email ?? row.user?.phone ?? ""}
                    </p>
                  </div>

                  {/* Role selector (changes the preset role) */}
                  <Select
                    value={row.role}
                    onValueChange={(v) => void changeRole(row, v as StaffRole)}
                    disabled={!row.active}
                  >
                    <SelectTrigger className="w-40" aria-label={t("centerStaff.role")}>
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

                  <Badge
                    variant={row.active ? "default" : "outline"}
                    className={row.active ? "bg-emerald-600 hover:bg-emerald-600" : "text-muted-foreground"}
                  >
                    {row.active ? t("centerStaff.active") : t("centerStaff.inactive")}
                  </Badge>

                  <ConfirmDialog
                    trigger={
                      <Button type="button" variant={row.active ? "ghost" : "outline"} size="sm">
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
        </Card>

        {/* Role permissions + exclusions (the design's "صلاحيات الموظف" panel,
            adapted to fixed presets rather than free toggles). */}
        <RolePermissionsPanel />
      </div>
    </div>
  );
}

function RolePermissionsPanel() {
  const t = useTranslations();
  const [role, setRole] = useState<StaffRole>("receptionist");
  return (
    <Card className="order-1 flex flex-col gap-4 p-4 lg:order-2">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-primary" />
        <h3 className="font-semibold text-foreground">{t("centerStaff.permissionsTitle")}</h3>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ROLES.map((r) => (
          <Button
            key={r}
            type="button"
            size="sm"
            variant={r === role ? "default" : "outline"}
            onClick={() => setRole(r)}
          >
            {t(`centerStaff.roleName.${r}` as Parameters<typeof t>[0])}
          </Button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {t(`centerStaff.roleDesc.${role}` as Parameters<typeof t>[0])}
      </p>

      <ul className="flex flex-col gap-1.5">
        {CAN[role].map((cap) => (
          <li key={cap} className="flex items-center gap-2 text-sm text-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {t(`centerStaff.can.${cap}` as Parameters<typeof t>[0])}
          </li>
        ))}
      </ul>

      <div className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Lock className="size-3.5" />
          <span className="text-xs font-medium">{t("centerStaff.excluded")}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">{t("centerStaff.auditNote")}</p>
    </Card>
  );
}

function AddStaffDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("receptionist");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setEmail("");
    setPassword("");
    setRole("receptionist");
    setTitle("");
    setError(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post("center/staff", {
        json: { name, email, password, role, ...(title.trim() ? { title } : {}) },
      });
      await onCreated();
      setOpen(false);
      reset();
    } catch (err) {
      if (err instanceof HTTPError) {
        const body = (await err.response.json().catch(() => null)) as {
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
            <Label htmlFor="staff-password">{t("centerStaff.password")}</Label>
            <PasswordInput
              id="staff-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !name.trim() || !email.trim() || password.length < 8}
          >
            {saving ? <Spinner /> : null}
            {t("centerStaff.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
