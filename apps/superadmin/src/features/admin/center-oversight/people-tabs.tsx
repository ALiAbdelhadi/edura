"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { GraduationCap, IdCard, Info, Mail, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogForm,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { LoadError } from "@repo/ui/components/ledger";
import { useQueryStrings } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { Num } from "@repo/ui/components/num";
import type { Locale } from "@repo/ui/lib/format";
import { asKey } from "@/lib/i18n/keys";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useAction } from "@/lib/api/use-action";
import { useAdminGet } from "./use-oversight";
import { ControlAction } from "./control-actions";
import { Form } from "@repo/ui/components/form";
import {
  EntityDialog,
  FieldControls,
  FormRootError,
  useFieldForm,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";
import { CollabRequestButton } from "./collab-request-dialog";

/**
 * The positional shape this file's call sites already use, over the shared
 * `useAction`. It holds no toast or error logic of its own — that all lives in
 * the hook now, which is what stops the double toast.
 *
 * It returns the whole `ActionResult` rather than a boolean: `EntityDialog`
 * reads `error.fields` off it to pin a server 422 onto the input that caused
 * it, which a boolean throws away.
 */
function useMutate(onDone: () => void) {
  const { run, busy } = useAction({ onSuccess: onDone });
  const mutate = (
    url: string,
    method: "post" | "patch" | "delete",
    values: Record<string, unknown>,
    successMsg: string,
  ) => run({ url, method, values, successMsg });
  return { mutate, busy };
}

type StudentRow = {
  studentId: string;
  rosterId: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  blacklisted: boolean;
  blacklistReason?: string | null;
};

export function StudentsTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const req = useAdminGet<{ items: StudentRow[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled },
  );
  const { mutate: run, busy } = useMutate(req.refetch);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
  const rows = req.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-2">{t("pp_rosterNote")}</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />{t("pp_addExisting")}</Button>
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />{t("pp_inviteStudent")}</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title={t("pp_noStudents")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pp_student")}</TableHead>
                <TableHead>{t("pp_email")}</TableHead>
                <TableHead>{t("pp_phone")}</TableHead>
                <TableHead>{t("pp_account")}</TableHead>
                <TableHead className="text-end">{t("pp_actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.rosterId}>
                  <TableCell className="font-medium">{s.name ?? s.studentId}</TableCell>
                  <TableCell>{s.email ?? "—"}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{s.status ?? "—"}</Badge>
                    {s.blacklisted ? (
                      <Badge variant="destructive" className="ms-1">
                        {tt("status.blacklisted")}
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                        <Pencil className="size-4" />{t("pp_edit")}</Button>
                      <ControlAction
                        label={t("pp_deactivate")}
                        title={t("pp_deactivateStudentQ")}
                        destructive
                        requireReason
                        confirmText={t("pp_deactivate")}
                        url={`admin/centers/${centerId}/members/${s.studentId}/status`}
                        values={{ kind: "student", action: "deactivate" }}
                        onDone={req.refetch}
                        description={
                          <p>{t("pp_accessCut")}</p>
                        }
                      />
                      {/* Harder than "remove from roster" below: this writes a
                          CENTRE blacklist and cascades the student's enrolments,
                          and it is the only action with an undo. */}
                      {s.blacklisted ? (
                        <ControlAction
                          label={t("pp_readmit")}
                          title={t("pp_readmitQ")}
                          requireReason
                          confirmText={t("pp_readmit")}
                          url={`admin/centers/${centerId}/students/${s.studentId}/membership`}
                          values={{ action: "restore" }}
                          onDone={req.refetch}
                          description={<p>{t("pp_readmitBody")}</p>}
                        />
                      ) : (
                        <ControlAction
                          label={t("pp_bar")}
                          title={t("pp_barQ")}
                          destructive
                          requireReason
                          confirmText={t("pp_bar")}
                          url={`admin/centers/${centerId}/students/${s.studentId}/membership`}
                          values={{ action: "remove" }}
                          onDone={req.refetch}
                          description={<p>{t("pp_barBody")}</p>}
                        />
                      )}
                      <ControlAction
                        label={t("pp_removeFromRoster")}
                        title={t("pp_removeFromRosterQ")}
                        destructive
                        confirmText={t("pp_remove")}
                        url={`admin/centers/${centerId}/roster/students/${s.studentId}`}
                        method="delete"
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <>
                            <p>
                              {t.rich("pp_removeRosterBody1", {
                                b: (chunks) => <strong>{chunks}</strong>,
                              })}
                            </p>
                            <p>{t("pp_removeRosterBody2")}</p>
                          </>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("pp_editStudent")}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <StudentEditForm
              centerId={centerId}
              row={editing}
              onSaved={() => {
                setEditing(null);
                req.refetch();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <EntityDialog
        open={inviting}
        onOpenChange={setInviting}
        title={t("pp_inviteStudentTitle")}
        note={t("pp_inviteStudentNote")}
        busy={busy}
        fields={[
          { name: "email", label: t("pp_email"), type: "email", required: true },
          { name: "name", label: t("pp_nameOptional"), type: "text" },
        ]}
        submitLabel={tt("actions.sendInvite")}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/students/invite`,
            "post",
            { email: v.email, ...(v.name ? { name: v.name } : {}) },
            t("pp_inviteSent"),
          )
        }
      />

      <EntityDialog
        open={adding}
        onOpenChange={setAdding}
        title={t("pp_addExistingStudent")}
        note={t("pp_addExistingNote")}
        busy={busy}
        fields={[
          { name: "studentId", label: t("pp_studentUserId"), type: "text", required: true, dir: "ltr" },
        ]}
        submitLabel={t("pp_addToRoster")}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/students`,
            "post",
            { studentId: v.studentId },
            t("pp_studentAddedToRoster"),
          )
        }
      />
    </div>
  );
}

function StudentEditForm({
  centerId,
  row,
  onSaved,
}: {
  centerId: string;
  row: StudentRow;
  onSaved: () => void;
}) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const { run: save_, busy } = useAction({
    url: `admin/centers/${centerId}/roster/students/${row.studentId}`,
    method: "patch",
    successMsg: t("pp_studentUpdated"),
    onSuccess: () => onSaved(),
  });

  const fields: FieldSpec[] = [
    { name: "name", label: t("pp_name"), type: "text" },
    { name: "email", label: t("pp_email"), type: "email", dir: "ltr" },
    { name: "phone", label: t("pp_phone"), type: "text", dir: "ltr" },
  ];

  const { form, submit, rootError } = useFieldForm({
    fields,
    resetKey: row.studentId,
    initial: { name: row.name ?? "", email: row.email ?? "", phone: row.phone ?? "" },
    onSubmit: async (v) => {
      const patch: Record<string, unknown> = {};
      const name = String(v.name).trim();
      const email = String(v.email).trim();
      const phone = String(v.phone).trim();
      if (name !== (row.name ?? "")) patch.name = name;
      if (email !== (row.email ?? "")) patch.email = email;
      if (phone !== (row.phone ?? "")) patch.phone = phone;
      if (!Object.keys(patch).length) {
        toast.info(t("pp_nothingChanged"));
        return;
      }
      // Returned, not swallowed: a 409 on the email or phone lands on that box.
      return save_({ values: patch });
    },
  });

  return (
    <Form {...form}>
      <DialogForm onSubmit={() => void submit()}>
        <FormRootError message={rootError} />
        <FieldControls fields={fields} form={form} className="grid gap-3" />
        <DialogFooter>
          <Button type="submit" disabled={busy}>
            {busy ? <Spinner /> : null}
            {tt("actions.save")}
          </Button>
        </DialogFooter>
      </DialogForm>
    </Form>
  );
}

type TeacherRow = {
  teacherId: string;
  name?: string | null;
  email?: string | null;
  status?: string | null;
  coursesCount: number;
  subjects: string[];
  affiliation: { status: string };
};

export function TeachersTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const req = useAdminGet<TeacherRow[]>(`admin/centers/${centerId}/roster/teachers`, { enabled });
  const { mutate: run, busy } = useMutate(req.refetch);
  const [inviting, setInviting] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
  const rows = req.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-2">{t("pp_teacherRemoveNote")}</p>
        <div className="flex flex-wrap gap-2">
          <CollabRequestButton centerId={centerId} onDone={req.refetch} />
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />{t("pp_inviteTeacher")}</Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t("pp_noTeachers")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pp_teacher")}</TableHead>
                <TableHead>{t("pp_email")}</TableHead>
                <TableHead>{t("pp_affiliation")}</TableHead>
                <TableHead>{t("pp_activeCourses")}</TableHead>
                <TableHead className="text-end">{t("pp_actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.teacherId}>
                  <TableCell className="font-medium">{row.name ?? row.teacherId}</TableCell>
                  <TableCell>{row.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.affiliation.status}</Badge>
                  </TableCell>
                  <TableCell>{row.coursesCount}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.status === "active" ? (
                        <ControlAction
                          label={t("pp_deactivate")}
                          title={t("pp_deactivateTeacherQ")}
                          destructive
                          requireReason
                          confirmText={t("pp_deactivate")}
                          url={`admin/centers/${centerId}/members/${row.teacherId}/status`}
                          values={{ kind: "teacher", action: "deactivate" }}
                          onDone={req.refetch}
                          description={
                            <p>
                              {t("pp_teacherLosesAccess")}
                            </p>
                          }
                        />
                      ) : (
                        <ControlAction
                          label={t("pp_activate")}
                          title={t("pp_reactivateTeacherQ")}
                          confirmText={t("pp_activate")}
                          url={`admin/centers/${centerId}/members/${row.teacherId}/status`}
                          values={{ kind: "teacher", action: "activate" }}
                          onDone={req.refetch}
                          description={<p>{t("pp_canSignInAgain")}</p>}
                        />
                      )}
                      <ControlAction
                        label={t("pp_removeFromCenter")}
                        title={t("pp_endAffiliationQ")}
                        destructive
                        confirmText={t("pp_remove")}
                        method="delete"
                        url={`admin/centers/${centerId}/roster/teachers/${row.teacherId}`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            {t("pp_affiliationEnds")}
                          </p>
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EntityDialog
        open={inviting}
        onOpenChange={setInviting}
        title={t("pp_inviteTeacherTitle")}
        note={t("pp_inviteTeacherNote")}
        busy={busy}
        fields={[
          { name: "email", label: t("pp_email"), type: "email", required: true },
          { name: "name", label: t("pp_nameOptional"), type: "text" },
        ]}
        submitLabel={tt("actions.sendInvite")}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/teachers/invite`,
            "post",
            { email: v.email, ...(v.name ? { name: v.name } : {}) },
            t("pp_inviteSent"),
          )
        }
      />
    </div>
  );
}

type StaffRow = {
  id: string;
  staffUserId: string;
  role: string;
  title?: string | null;
  removedAt?: string | null;
  user?: { name?: string | null; email?: string | null; status?: string | null } | null;
  name?: string | null;
  email?: string | null;
};

const STAFF_ROLES = ["receptionist", "manager", "center_accountant"] as const;

export function StaffTab({ centerId, enabled }: { centerId: string; enabled: boolean }) {
  const t = useTranslations("oversight");
  const queryStrings = useQueryStrings();
  const req = useAdminGet<StaffRow[] | { items: StaffRow[] }>(
    `admin/centers/${centerId}/staff`,
    { enabled },
  );
  const { mutate: run, busy } = useMutate(req.refetch);
  const [creating, setCreating] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  if (req.isError) {
    return (
      <LoadError
        message={queryStrings.loadFailed}
        onRetry={req.refetch}
        retryLabel={queryStrings.retry}
      />
    );
  }
  const raw = req.data;
  const rows: StaffRow[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>{t("pp_staffNoPassword")}</AlertTitle>
        <AlertDescription>
          {t("pp_staffNoPasswordBody")}
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />{t("pp_addStaff")}</Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={IdCard} title={t("pp_noStaff")} />
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pp_name")}</TableHead>
                <TableHead>{t("pp_email")}</TableHead>
                <TableHead>{t("pp_subRole")}</TableHead>
                <TableHead>{t("pp_title")}</TableHead>
                <TableHead className="text-end">{t("pp_actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">
                    {s.user?.name ?? s.name ?? "—"}
                  </TableCell>
                  <TableCell>{s.user?.email ?? s.email ?? "—"}</TableCell>
                  <TableCell>
                    <RoleSelect
                      value={s.role}
                      onChange={(role) =>
                        run(
                          `admin/centers/${centerId}/staff/${s.id}`,
                          "patch",
                          { role },
                          t("pp_staffRoleUpdated"),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell>{s.title ?? "—"}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ControlAction
                        label={
                          <>
                            <Mail className="size-4" />{t("pp_resendInvite")}</>
                        }
                        title={t("pp_resendQ")}
                        confirmText={t("pp_resend")}
                        url={`admin/centers/${centerId}/staff/${s.id}/invite`}
                        values={{}}
                        onDone={req.refetch}
                        description={<p>{t("pp_resendBody")}</p>}
                      />
                      <ControlAction
                        label={
                          <>
                            <Trash2 className="size-4" />{t("pp_remove")}</>
                        }
                        title={t("pp_removeStaffQ")}
                        destructive
                        confirmText={t("pp_remove")}
                        method="delete"
                        url={`admin/centers/${centerId}/staff/${s.id}`}
                        values={{}}
                        onDone={req.refetch}
                        description={<p>{t("pp_removeStaffBody")}</p>}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <EntityDialog
        open={creating}
        onOpenChange={setCreating}
        title={t("pp_addStaffTitle")}
        busy={busy}
        note={t.rich("pp_accountantReadOnly", {
          role: t("pp_role_center_accountant"),
          b: (chunks) => <strong>{chunks}</strong>,
        })}
        initial={{ role: "receptionist" }}
        fields={[
          { name: "name", label: t("pp_name"), type: "text", required: true },
          { name: "email", label: t("pp_email"), type: "email", required: true },
          {
            name: "role",
            label: t("pp_subRole"),
            type: "select",
            required: true,
            options: STAFF_ROLES.map((r) => ({
              value: r,
              label: t(asKey(`pp_role_${r}`)),
            })),
          },
          { name: "title", label: t("pp_titleOptional"), type: "text" },
        ]}
        submitLabel={t("pp_createSendClaimLink")}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/staff`,
            "post",
            {
              name: String(v.name).trim(),
              email: String(v.email).trim().toLowerCase(),
              role: v.role,
              ...(String(v.title ?? "").trim() ? { title: String(v.title).trim() } : {}),
            },
            t("pp_staffAdded"),
          )
        }
      />
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations("oversight");
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44" aria-label={t("pp_subRole")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {t(asKey(`pp_role_${r}`))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CenterAdminsCard({ centerId }: { centerId: string }) {
  const t = useTranslations("oversight");
  const tt = useTranslations();
  const queryStrings = useQueryStrings();
  const locale = useLocale() as Locale;
  const req = useAdminGet<{ id: string; name: string; email: string | null; status: string }[]>(
    `admin/centers/${centerId}/admins`,
  );
  const { mutate: run, busy } = useMutate(req.refetch);
  const [inviting, setInviting] = useState(false);
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>{t("pp_centerAdmins")}</span>
          <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />{t("pp_inviteAdmin")}</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {req.isLoading ? (
          <Spinner />
        ) : req.isError ? (
          <LoadError
            message={queryStrings.loadFailed}
            onRetry={req.refetch}
            retryLabel={queryStrings.retry}
          />
        ) : rows.length === 0 ? (
          <p className="text-sm text-ink-2">{t("pp_noCenterAdmins")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{a.name}</span>
                  {a.email ? (
                    <span className="text-ink-2"> · {a.email}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{a.status}</Badge>
                  <ControlAction
                    label={t("pp_remove")}
                    title={t("pp_removeAdminQ")}
                    destructive
                    confirmText={t("pp_remove")}
                    method="delete"
                    url={`admin/centers/${centerId}/admins/${a.id}`}
                    values={{}}
                    onDone={req.refetch}
                    description={<p>{t("pp_removeAdminBody")}</p>}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-2">
          {t("pp_loaded")} <Num.Date value={new Date()} locale={locale} options={{ timeStyle: "short" }} />
        </p>
      </CardContent>

      <EntityDialog
        open={inviting}
        onOpenChange={setInviting}
        title={t("pp_inviteAdminTitle")}
        note={t("pp_inviteAdminNote")}
        busy={busy}
        fields={[{ name: "email", label: t("pp_email"), type: "email", required: true }]}
        submitLabel={tt("actions.sendInvite")}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/admins/invite`,
            "post",
            { email: v.email },
            t("pp_inviteSent"),
          )
        }
      />
    </Card>
  );
}

