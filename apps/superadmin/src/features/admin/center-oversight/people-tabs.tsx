"use client";

import { useState } from "react";
import { useCustomMutation } from "@refinedev/core";
import { Info, Mail, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
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
import { toast } from "@repo/ui/components/sonner";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { useAdminGet } from "./use-oversight";
import { ControlAction } from "./control-actions";

// ---------------------------------------------------------------------------
// PHASE 1 — People tabs. Every button here calls a back-office route that runs
// the SAME kernel service the center portal runs, scoped to this center, with
// an audit row per mutation.
// ---------------------------------------------------------------------------

function useMutate(onDone: () => void) {
  const { mutateAsync } = useCustomMutation();
  return async (
    url: string,
    method: "post" | "patch" | "delete",
    values: Record<string, unknown>,
    successMsg: string,
  ) => {
    try {
      await mutateAsync({ url, method, values });
      toast.success(successMsg);
      onDone();
      return true;
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Action failed");
      return false;
    }
  };
}

/** Small labelled field used by the dialogs below. */
function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

// ===========================================================================
// Students
// ===========================================================================

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
  const req = useAdminGet<{ items: StudentRow[] }>(
    `admin/centers/${centerId}/roster/students`,
    { enabled },
  );
  const run = useMutate(req.refetch);
  const [editing, setEditing] = useState<StudentRow | null>(null);
  const [inviting, setInviting] = useState(false);
  const [adding, setAdding] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          The same roster the center manages. Removing from the roster keeps every enrollment —
          withdrawing enrollments is the separate, reversible action below.
        </p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Add existing
          </Button>
          <Button size="sm" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />
            Invite student
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No students on this roster.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Account</TableHead>
                <TableHead className="text-end">Actions</TableHead>
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
                        blocked
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <ControlAction
                        label="Deactivate"
                        title="Deactivate this student's account?"
                        destructive
                        requireReason
                        confirmText="Deactivate"
                        url={`admin/centers/${centerId}/members/${s.studentId}/status`}
                        values={{ kind: "student", action: "deactivate" }}
                        onDone={req.refetch}
                        description={
                          <p>Access is cut on their next request. Enrollments are kept.</p>
                        }
                      />
                      <ControlAction
                        label="Remove from roster"
                        title="Remove this student from the roster?"
                        destructive
                        confirmText="Remove"
                        url={`admin/centers/${centerId}/roster/students/${s.studentId}`}
                        method="delete"
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <>
                            <p>
                              They leave the center&apos;s roster. This is the center&apos;s own
                              removal — it does <strong>not</strong> withdraw enrollments and
                              refunds nothing.
                            </p>
                            <p>
                              To withdraw enrollments reversibly, use &ldquo;Remove from
                              center&rdquo; on the Students control row instead.
                            </p>
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

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit student</DialogTitle>
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

      {/* Invite */}
      <SimpleFormDialog
        open={inviting}
        onOpenChange={setInviting}
        title="Invite a student"
        note="Creates a shell account on this center's roster and emails an activation link. An already-registered email is refused."
        fields={[
          { key: "email", label: "Email", type: "email", required: true },
          { key: "name", label: "Name (optional)" },
        ]}
        submitLabel="Send invite"
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/students/invite`,
            "post",
            { email: v.email, ...(v.name ? { name: v.name } : {}) },
            "Invite sent",
          )
        }
      />

      {/* Add an existing student by id */}
      <SimpleFormDialog
        open={adding}
        onOpenChange={setAdding}
        title="Add an existing student"
        note="Adds an already-registered student account to this center's roster by their user id."
        fields={[{ key: "studentId", label: "Student user id (UUID)", required: true }]}
        submitLabel="Add to roster"
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/students`,
            "post",
            { studentId: v.studentId },
            "Student added to the roster",
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
  const { mutateAsync } = useCustomMutation();
  const [name, setName] = useState(row.name ?? "");
  const [email, setEmail] = useState(row.email ?? "");
  const [phone, setPhone] = useState(row.phone ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const patch: Record<string, unknown> = {};
    if (name.trim() !== (row.name ?? "")) patch.name = name.trim();
    if (email.trim() !== (row.email ?? "")) patch.email = email.trim();
    if (phone.trim() !== (row.phone ?? "")) patch.phone = phone.trim();
    if (!Object.keys(patch).length) {
      toast.info("Nothing changed");
      return;
    }
    setBusy(true);
    try {
      await mutateAsync({
        url: `admin/centers/${centerId}/roster/students/${row.studentId}`,
        method: "patch",
        values: patch,
      });
      toast.success("Student updated — recorded in the audit log");
      onSaved();
    } catch (e) {
      toast.error((e as { message?: string })?.message || "Failed to update");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Name" value={name} onChange={setName} />
      <Field label="Email" value={email} onChange={setEmail} type="email" />
      <Field label="Phone" value={phone} onChange={setPhone} />
      <DialogFooter>
        <Button onClick={save} disabled={busy}>
          {busy ? <Spinner /> : null}
          Save
        </Button>
      </DialogFooter>
    </div>
  );
}

// ===========================================================================
// Teachers
// ===========================================================================

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
  const req = useAdminGet<TeacherRow[]>(`admin/centers/${centerId}/roster/teachers`, { enabled });
  const run = useMutate(req.refetch);
  const [inviting, setInviting] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const rows = req.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Removing a teacher is refused while they still have active courses here — the same rule
          the center is held to.
        </p>
        <Button size="sm" onClick={() => setInviting(true)}>
          <UserPlus className="size-4" />
          Invite teacher
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No teachers at this center.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Teacher</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Affiliation</TableHead>
                <TableHead>Active courses</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.teacherId}>
                  <TableCell className="font-medium">{t.name ?? t.teacherId}</TableCell>
                  <TableCell>{t.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.affiliation.status}</Badge>
                  </TableCell>
                  <TableCell>{t.coursesCount}</TableCell>
                  <TableCell className="text-end">
                    <div className="flex flex-wrap justify-end gap-2">
                      <ControlAction
                        label="Deactivate"
                        title="Deactivate this teacher?"
                        destructive
                        requireReason
                        confirmText="Deactivate"
                        url={`admin/centers/${centerId}/members/${t.teacherId}/status`}
                        values={{ kind: "teacher", action: "deactivate" }}
                        onDone={req.refetch}
                        description={
                          <p>
                            They lose access on their next request. Courses, schedules and all
                            financial history are untouched.
                          </p>
                        }
                      />
                      <ControlAction
                        label="Activate"
                        title="Reactivate this teacher?"
                        confirmText="Activate"
                        url={`admin/centers/${centerId}/members/${t.teacherId}/status`}
                        values={{ kind: "teacher", action: "activate" }}
                        onDone={req.refetch}
                        description={<p>The account can sign in again immediately.</p>}
                      />
                      <ControlAction
                        label="Remove from center"
                        title="End this teacher's affiliation?"
                        destructive
                        confirmText="Remove"
                        method="delete"
                        url={`admin/centers/${centerId}/roster/teachers/${t.teacherId}`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            Their affiliation ends. Refused while they have active courses here —
                            cancel or reassign those first.
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

      <SimpleFormDialog
        open={inviting}
        onOpenChange={setInviting}
        title="Invite a teacher"
        note="Shell-account onboarding only. A teacher who already has an account is refused here — send them a collaboration request instead."
        fields={[
          { key: "email", label: "Email", type: "email", required: true },
          { key: "name", label: "Name (optional)" },
        ]}
        submitLabel="Send invite"
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/roster/teachers/invite`,
            "post",
            { email: v.email, ...(v.name ? { name: v.name } : {}) },
            "Invite sent",
          )
        }
      />
    </div>
  );
}

// ===========================================================================
// Staff
// ===========================================================================

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
  const req = useAdminGet<StaffRow[] | { items: StaffRow[] }>(
    `admin/centers/${centerId}/staff`,
    { enabled },
  );
  const run = useMutate(req.refetch);
  const [creating, setCreating] = useState(false);

  if (!enabled) return null;
  if (req.isLoading) return <PageSpinner />;
  const raw = req.data;
  const rows: StaffRow[] = Array.isArray(raw) ? raw : (raw?.items ?? []);

  return (
    <div className="space-y-3">
      <Alert>
        <Info className="size-4" />
        <AlertTitle>Staff never receive a password from anyone</AlertTitle>
        <AlertDescription>
          A new staff account is created as a shell and emailed a single-use claim link — the
          person sets their own credential. Re-sending is refused once they have.
        </AlertDescription>
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" />
          Add staff
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">No staff accounts.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Sub-role</TableHead>
                <TableHead>Title</TableHead>
                <TableHead className="text-end">Actions</TableHead>
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
                          "Staff role updated",
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
                            <Mail className="size-4" />
                            Resend invite
                          </>
                        }
                        title="Re-send the claim link?"
                        confirmText="Re-send"
                        url={`admin/centers/${centerId}/staff/${s.id}/invite`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            Mints a fresh single-use link. Refused if this person has already set
                            a password — that is what the reset flow is for.
                          </p>
                        }
                      />
                      <ControlAction
                        label={
                          <>
                            <Trash2 className="size-4" />
                            Remove
                          </>
                        }
                        title="Remove this staff member?"
                        destructive
                        confirmText="Remove"
                        method="delete"
                        url={`admin/centers/${centerId}/staff/${s.id}`}
                        values={{}}
                        onDone={req.refetch}
                        description={
                          <p>
                            Their link is soft-removed, so their access ends on the next request
                            and the history of what they did is kept.
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

      <StaffCreateDialog
        open={creating}
        onOpenChange={setCreating}
        onSubmit={(v) =>
          run(
            `admin/centers/${centerId}/staff`,
            "post",
            v as unknown as Record<string, unknown>,
            "Staff member added — claim link emailed",
          )
        }
      />
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StaffCreateDialog({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSubmit: (v: { name: string; email: string; role: string; title?: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>("receptionist");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (name.trim().length < 2 || !email.trim()) {
      toast.error("Name and email are required");
      return;
    }
    setBusy(true);
    const okDone = await onSubmit({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      ...(title.trim() ? { title: title.trim() } : {}),
    });
    setBusy(false);
    if (okDone) {
      setName("");
      setEmail("");
      setTitle("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff member</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name" value={name} onChange={setName} />
          <Field label="Email" value={email} onChange={setEmail} type="email" />
          <label className="space-y-1 text-sm">
            <span className="font-medium">Sub-role</span>
            <RoleSelect value={role} onChange={setRole} />
          </label>
          <Field label="Title (optional)" value={title} onChange={setTitle} />
          <p className="text-xs text-muted-foreground">
            <strong>center_accountant</strong> is read-only — it can view this center&apos;s
            financial reports and nothing else.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            Create &amp; send claim link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// Co-owner admins (rendered on the Overview tab)
// ===========================================================================

export function CenterAdminsCard({ centerId }: { centerId: string }) {
  const { formatDate } = useFormatters();
  const req = useAdminGet<{ id: string; name: string; email: string | null; status: string }[]>(
    `admin/centers/${centerId}/admins`,
  );
  const run = useMutate(req.refetch);
  const [inviting, setInviting] = useState(false);
  const rows = req.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span>Center admins</span>
          <Button size="sm" variant="outline" onClick={() => setInviting(true)}>
            <UserPlus className="size-4" />
            Invite admin
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {req.isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No center admin accounts.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {rows.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="font-medium">{a.name}</span>
                  {a.email ? (
                    <span className="text-muted-foreground"> · {a.email}</span>
                  ) : null}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant="secondary">{a.status}</Badge>
                  <ControlAction
                    label="Remove"
                    title="Remove this center admin?"
                    destructive
                    confirmText="Remove"
                    method="delete"
                    url={`admin/centers/${centerId}/admins/${a.id}`}
                    values={{}}
                    onDone={req.refetch}
                    description={
                      <p>
                        Refused if they are the last admin — a center can never be left without
                        an owner.
                      </p>
                    }
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Loaded {formatDate(new Date(), { timeStyle: "short" })}
        </p>
      </CardContent>

      <SimpleFormDialog
        open={inviting}
        onOpenChange={setInviting}
        title="Invite a center admin"
        note="Emails an invite to become a co-owner of this center."
        fields={[{ key: "email", label: "Email", type: "email", required: true }]}
        submitLabel="Send invite"
        onSubmit={(v) =>
          run(`admin/centers/${centerId}/admins/invite`, "post", { email: v.email }, "Invite sent")
        }
      />
    </Card>
  );
}

// ===========================================================================
// Shared small form dialog
// ===========================================================================

function SimpleFormDialog({
  open,
  onOpenChange,
  title,
  note,
  fields,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  note?: string;
  fields: { key: string; label: string; type?: string; required?: boolean }[];
  submitLabel: string;
  onSubmit: (values: Record<string, string>) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    setBusy(true);
    const done = await onSubmit(values);
    setBusy(false);
    if (done) {
      setValues({});
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
          {fields.map((f) => (
            <Field
              key={f.key}
              label={f.label}
              type={f.type}
              value={values[f.key] ?? ""}
              onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}
            />
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
