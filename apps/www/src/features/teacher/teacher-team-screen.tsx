"use client";

// Teacher team management: create/remove assistant accounts. Assistants are
// the primary chat contact for the teacher's students & parents (the teacher
// handles escalations only — see the conversation policy).
import React, { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { HTTPError } from "ky";
import { Card } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Badge } from "@repo/ui/components/badge";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
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
import { InviteLink, type InviteDelivery } from "@/components/kit/invite-link";
import { api } from "@/lib/api/client";

type AssistantRow = {
  id: string;
  assistantId: string;
  title: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string | null; status: string } | null;
};

export function TeacherTeamScreen() {
  const t = useTranslations();
  const [rows, setRows] = useState<AssistantRow[] | null>(null);

  const load = useCallback(async () => {
    const res = await api
      .get("teacher/assistants")
      .json<{ data: AssistantRow[] }>();
    setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: AssistantRow) => {
    await api.delete(`teacher/assistants/${row.id}`);
    void load();
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={t("team.title")}
        description={t("team.subtitle")}
        actions={<AddAssistantDialog onCreated={load} />}
      />
      <Card className="p-0">
        {rows === null ? (
          <div className="flex justify-center p-8">
            <Spinner />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={Users}
              title={t("team.empty")}
              description={t("team.emptyHint")}
            />
          </div>
        ) : (
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
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
                  <p className="truncate text-xs text-muted-foreground">
                    {row.user?.email}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      aria-label={t("team.remove")}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  }
                  title={t("team.removeTitle")}
                  description={t("team.removeDescription", {
                    name: row.user?.name ?? "",
                  })}
                  confirmText={t("team.remove")}
                  cancelText={t("actions.cancel")}
                  destructive
                  onConfirm={() => void remove(row)}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AddAssistantDialog({ onCreated }: { onCreated: () => Promise<void> }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [invite, setInvite] = useState<
    { claimLink: string; delivery: InviteDelivery; to: string } | null
  >(null);

  const reset = () => {
    setName("");
    setEmail("");
    setTitle("");
    setError(null);
    setInvite(null);
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api
        .post("teacher/assistants", {
          json: { name, email, ...(title.trim() ? { title } : {}) },
        })
        .json<{
          data?: { invite?: { claimLink: string; delivery: InviteDelivery } | null };
        }>();
      await onCreated();
      // Deliberately NOT closing the dialog: the copyable link is the fallback
      // when the invite email does not arrive, and closing would throw it away.
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
        const body = (await err.response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setError(body?.error?.message ?? t("team.createFailed"));
      } else {
        setError(t("team.createFailed"));
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
          {t("team.add")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("team.add")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-name">{t("team.name")}</Label>
            <Input
              id="assistant-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-email">{t("team.email")}</Label>
            <Input
              id="assistant-email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="assistant-title">{t("team.roleTitle")}</Label>
            <Input
              id="assistant-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("team.roleTitlePlaceholder")}
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("team.inviteNote")}</p>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {invite ? (
            <InviteLink
              link={invite.claimLink}
              delivery={invite.delivery}
              to={invite.to}
            />
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
              {t("team.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
