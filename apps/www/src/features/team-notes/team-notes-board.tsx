"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Textarea } from "@repo/ui/components/textarea";
import { cn } from "@repo/ui/lib/utils";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner } from "@/components/kit/spinner";
import { api } from "@/lib/api/client";
import { asKey } from "@/lib/i18n/keys";
import { useFormatters } from "@/lib/i18n/use-formatters";

// Team notes — the shared to-do board for ONE team (center front-desk team or
// teacher + assistants). The API derives the board from the caller's own
// delegation link, so this component never has to know which team it shows.

type NoteStatus = "open" | "done" | "declined";

type PersonRef = { id: string; name: string | null };

type Note = {
  id: string;
  body: string;
  pinned: boolean;
  status: NoteStatus;
  author: PersonRef;
  statusChangedBy: PersonRef | null;
  statusChangedAt: string | null;
  createdAt: string;
  readBy: (PersonRef & { readAt: string })[];
};

type Board = {
  board: "center" | "teacher";
  me: { id: string; lead: boolean; canWrite: boolean };
  members: (PersonRef & { role: string | null })[];
  notes: Note[];
};

// Status → to-do theming. `card` colors the whole row like a checked-off /
// crossed-out task; `badge` is the small status chip.
const STATUS_THEME: Record<
  NoteStatus,
  { card: string; body: string; badge: string; icon: React.ElementType }
> = {
  open: {
    card: "border-s-primary/50",
    body: "",
    badge: "bg-primary/10 text-primary",
    icon: ClipboardList,
  },
  done: {
    card: "border-s-success bg-success/5",
    body: "line-through opacity-60",
    badge: "bg-success/15 text-success",
    icon: CheckCircle2,
  },
  declined: {
    card: "border-s-destructive bg-destructive/5",
    body: "line-through opacity-50",
    badge: "bg-destructive/10 text-destructive",
    icon: XCircle,
  },
};

function timeAgo(
  dateStr: string,
  t: ReturnType<typeof useTranslations<never>>,
  formatNumber: (n: number | null | undefined) => string,
): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("shared.timeJustNow");
  if (m < 60) return t("shared.timeMinutesAgo", { n: formatNumber(m) });
  const h = Math.floor(m / 60);
  if (h < 24) return t("shared.timeHoursAgo", { n: formatNumber(h) });
  return t("shared.timeDaysAgo", { n: formatNumber(Math.floor(h / 24)) });
}

export function TeamNotesBoard({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const { formatNumber } = useFormatters();
  const pathname = usePathname();
  // /{locale}/dashboard/{portal}/… → the portal segment ("staff", "admin", …).
  const portal = pathname?.split("/dashboard/")[1]?.split("/")[0] ?? "staff";
  const basePath = `/dashboard/${portal}`;

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const r = await api.get("team-notes").json<{ data: Board }>();
      setBoard(r.data);
    } catch {
      setBoard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const addNote = async () => {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      await api.post("team-notes", { json: { body } });
      setDraft("");
    } catch {
      // A slow notify fanout can outlive the client timeout while the write
      // itself committed — refresh below self-heals either way.
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const patchNote = async (
    id: string,
    patch: { body?: string; pinned?: boolean; status?: NoteStatus },
  ) => {
    try {
      await api.patch(`team-notes/${id}`, { json: patch });
    } catch {
      // Same self-heal as addNote: the mutation may have landed despite a
      // client-side timeout.
    } finally {
      await refresh();
    }
  };

  const removeNote = async (id: string) => {
    if (!window.confirm(t("teamNotes.confirmDelete"))) return;
    try {
      await api.delete(`team-notes/${id}`);
    } catch {
      // Self-heal on timeout (see addNote).
    } finally {
      await refresh();
    }
  };

  if (loading) {
    return compact ? (
      <Card className="py-0">
        <CardContent className="p-4 text-sm text-muted-foreground">
          {t("common.loading")}
        </CardContent>
      </Card>
    ) : (
      <PageSpinner label={t("common.loading")} />
    );
  }
  if (!board) return null;

  const totalMembers = board.members.length;
  const openCount = board.notes.filter((n) => n.status === "open").length;
  // Compact: surface what still needs doing — open (pinned-first order is
  // preserved from the API), then the most recent finished ones.
  const visibleNotes = compact
    ? [
        ...board.notes.filter((n) => n.status === "open"),
        ...board.notes.filter((n) => n.status !== "open"),
      ].slice(0, 4)
    : board.notes;

  const renderReadBy = (note: Note) => {
    const others = note.readBy.filter((r) => r.id !== note.author.id);
    const names = others
      .map((r) => r.name ?? "—")
      .filter(Boolean)
      .join("، ");
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"
        title={names || t("teamNotes.readByNone")}
      >
        <Eye className="size-3" />
        {t("teamNotes.readBy", {
          n: formatNumber(others.length),
          total: formatNumber(Math.max(totalMembers - 1, 0)),
        })}
        {!compact && names && (
          <span className="hidden truncate max-w-[220px] sm:inline">
            — {names}
          </span>
        )}
      </span>
    );
  };

  const renderNote = (note: Note) => {
    const theme = STATUS_THEME[note.status];
    const StatusIcon = theme.icon;
    const mine = note.author.id === board.me.id;
    const mayAct = board.me.canWrite;
    const mayPin = mayAct && (mine || board.me.lead);
    const mayDelete = mayAct && (mine || board.me.lead);
    const editing = editingId === note.id;

    return (
      <Card
        key={note.id}
        className={cn("border-s-2 py-0 transition-colors", theme.card)}
      >
        <CardContent className={cn("p-3", compact && "p-2.5")}>
          <div className="flex items-start gap-2">
            <StatusIcon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                note.status === "done" && "text-success",
                note.status === "declined" && "text-destructive",
                note.status === "open" && "text-primary",
              )}
            />
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex flex-col gap-2">
                  <Textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        const body = editDraft.trim();
                        if (body) await patchNote(note.id, { body });
                        setEditingId(null);
                      }}
                    >
                      {t("actions.save")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      {t("actions.cancel")}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className={cn("m-0 whitespace-pre-wrap text-sm", theme.body)}>
                  {note.body}
                </p>
              )}

              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-[11px] text-muted-foreground">
                  {note.author.name ?? "—"} · {timeAgo(note.createdAt, t, formatNumber)}
                </span>
                {note.status !== "open" && note.statusChangedBy && (
                  <span className="text-[11px] text-muted-foreground">
                    {t("teamNotes.statusBy", {
                      name: note.statusChangedBy.name ?? "—",
                      status: t(asKey(`teamNotes.status_${note.status}`)),
                    })}
                  </span>
                )}
                {renderReadBy(note)}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-0.5">
              {note.pinned && (
                <Badge className={cn("me-1 gap-1 px-1.5", STATUS_THEME.open.badge)}>
                  <Pin className="size-3" />
                </Badge>
              )}
              {!mayAct ? null : note.status === "open" ? (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-success hover:text-success"
                    title={t("teamNotes.markDone")}
                    onClick={() => patchNote(note.id, { status: "done" })}
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-destructive hover:text-destructive"
                    title={t("teamNotes.decline")}
                    onClick={() => patchNote(note.id, { status: "declined" })}
                  >
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title={t("teamNotes.reopen")}
                  onClick={() => patchNote(note.id, { status: "open" })}
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
              {!compact && mayPin && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title={note.pinned ? t("teamNotes.unpin") : t("teamNotes.pin")}
                  onClick={() => patchNote(note.id, { pinned: !note.pinned })}
                >
                  {note.pinned ? (
                    <PinOff className="size-4" />
                  ) : (
                    <Pin className="size-4" />
                  )}
                </Button>
              )}
              {!compact && mayAct && mine && !editing && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  title={t("actions.edit")}
                  onClick={() => {
                    setEditingId(note.id);
                    setEditDraft(note.body);
                  }}
                >
                  <Pencil className="size-4" />
                </Button>
              )}
              {!compact && mayDelete && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  title={t("actions.delete")}
                  onClick={() => removeNote(note.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // The API is the real gate; canWrite only hides the composer for the
  // read-only center_accountant (whose reads still register — listing IS the read).
  const composer = board.me.canWrite && (
    <div className={cn("flex items-start gap-2", compact && "items-center")}>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("teamNotes.placeholder")}
        rows={compact ? 1 : 2}
        maxLength={2000}
        className={cn(compact && "min-h-9 resize-none")}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void addNote();
        }}
      />
      <Button onClick={addNote} disabled={busy || !draft.trim()} size={compact ? "sm" : "default"}>
        <Plus className="size-4" />
        {t("teamNotes.add")}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <Card className="py-0">
        <CardContent className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 font-medium">
              <ClipboardList className="size-4 text-primary" />
              {t("teamNotes.title")}
              {openCount > 0 && (
                <Badge variant="secondary">{formatNumber(openCount)}</Badge>
              )}
            </span>
            <Link
              href={`${basePath}/notes`}
              className="text-xs text-primary hover:underline"
            >
              {t("teamNotes.viewAll")}
            </Link>
          </div>
          {composer}
          {visibleNotes.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">
              {t("teamNotes.empty")}
            </p>
          ) : (
            <div className="flex flex-col gap-2">{visibleNotes.map(renderNote)}</div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex w-full max-w-[760px] flex-col gap-6">
      <PageHeader
        title={t("teamNotes.title")}
        description={t("teamNotes.subtitle")}
      />
      {composer}
      {visibleNotes.length === 0 ? (
        <EmptyState icon={ClipboardList} title={t("teamNotes.empty")} />
      ) : (
        <div className="flex flex-col gap-3">{visibleNotes.map(renderNote)}</div>
      )}
    </div>
  );
}
