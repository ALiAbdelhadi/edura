"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCustom } from "@refinedev/core";
import { Check, Copy, ExternalLink, Globe, Save, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { SectionHead } from "@repo/ui/components/ledger";
import { toast } from "@repo/ui/components/sonner";
import { api } from "@/lib/api/client";
import { Spinner } from "@/components/kit/spinner";
import {
  HANDLE_MAX,
  handleProblem,
  normalizeHandle,
  type HandleProblem,
} from "@/lib/services/public-handles/handle-rules";

type Mine = {
  kind: "center" | "teacher";
  handle: string | null;
  url: string | null;
  pathUrl: string | null;
  rootDomain: string | null;
};

type Availability = {
  handle: string;
  available: boolean;
  problem: HandleProblem | "taken" | null;
};

type Status =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "bad"; problem: HandleProblem | "taken" }
  | { state: "ok" };

// The owner's public name. The same rules run here, at the API and in the
// database CHECK — the client copy exists only so the owner sees the reason
// before the round trip, never as the gate.
export function PublicHandleCard() {
  const t = useTranslations("publicHandle");
  const { query, result } = useCustom({ url: "me/public-handle", method: "get" });
  const raw = (result as { data?: Partial<Mine> } | undefined)?.data;
  // refine hands back an empty object before the first response lands; a
  // loaded payload always carries `kind`.
  const mine = raw && typeof raw.kind === "string" ? (raw as Mine) : undefined;

  const [value, setValue] = useState<string>("");
  const [remote, setRemote] = useState<{ handle: string; result: Availability } | null>(null);
  const [saving, setSaving] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    if (mine && !seeded.current) {
      seeded.current = true;
      setValue(mine.handle ?? "");
    }
  }, [mine]);

  const normalized = useMemo(() => normalizeHandle(value), [value]);
  const unchanged = normalized === (mine?.handle ?? "");
  const localProblem = useMemo(
    () => (normalized && !unchanged ? handleProblem(normalized) : null),
    [normalized, unchanged],
  );
  const needsRemote = Boolean(normalized) && !unchanged && localProblem === null;

  // Status is DERIVED: nothing here is set inside an effect. The only state
  // the availability check owns is the last answer, keyed by the handle it
  // answered for, so a stale reply for a previous keystroke is ignored.
  const status: Status = !normalized || unchanged
    ? { state: "idle" }
    : localProblem
      ? { state: "bad", problem: localProblem }
      : remote?.handle === normalized
        ? remote.result.available
          ? { state: "ok" }
          : { state: "bad", problem: remote.result.problem ?? "taken" }
        : { state: "checking" };

  useEffect(() => {
    if (!needsRemote) return;
    const handle = normalized;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const body = await api
          .get("me/public-handle/check", { searchParams: { handle }, signal: ctrl.signal })
          .json<{ data: Availability }>();
        if (!ctrl.signal.aborted) setRemote({ handle, result: body.data });
      } catch {
        /* aborted or offline: the field simply stays "checking" until the next keystroke */
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [needsRemote, normalized]);

  const save = async () => {
    if (!normalized || unchanged || status.state === "bad") return;
    setSaving(true);
    try {
      await api.put("me/public-handle", { json: { handle: normalized } });
      toast.success(t("saved"));
      seeded.current = false;
      await query.refetch();
    } catch (err) {
      toast.error((err as Error)?.message || t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await api.delete("me/public-handle");
      toast.success(t("removed"));
      seeded.current = false;
      setValue("");
      await query.refetch();
    } catch (err) {
      toast.error((err as Error)?.message || t("saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    if (!mine?.url) return;
    try {
      await navigator.clipboard.writeText(mine.url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("saveFailed"));
    }
  };

  const hint =
    status.state === "checking"
      ? t("checking")
      : status.state === "ok"
        ? t("available")
        : status.state === "bad"
          ? t(status.problem)
          : null;

  const hintTone =
    status.state === "ok"
      ? "text-teal"
      : status.state === "bad"
        ? "text-red"
        : "text-ink-3";

  return (
    <section className="flex flex-col gap-3">
      <SectionHead
        title={
          <span className="flex items-center gap-2">
            <Globe className="size-4" aria-hidden />
            {t("title")}
          </span>
        }
      />
      <div className="rounded-xl border border-rule bg-sheet p-4">
        <p className="mb-4 text-[13px] text-ink-3">
          {mine?.kind === "center" ? t("subtitleCenter") : t("subtitleTeacher")}
        </p>

        {!mine ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="public-handle">{t("label")}</Label>
              <Input
                id="public-handle"
                dir="ltr"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={HANDLE_MAX}
                placeholder={t("placeholder")}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                aria-describedby="public-handle-hint"
                aria-invalid={status.state === "bad" || undefined}
              />
              <div
                id="public-handle-hint"
                className={`flex min-h-5 items-center gap-1.5 text-[12px] ${hintTone}`}
                aria-live="polite"
              >
                {status.state === "checking" ? <Spinner /> : null}
                {status.state === "ok" ? <Check className="size-3.5" aria-hidden /> : null}
                {status.state === "bad" ? <X className="size-3.5" aria-hidden /> : null}
                {hint}
              </div>
            </div>

            {mine.handle && mine.url ? (
              <div className="rounded-lg border border-rule bg-paper/60 p-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-ink-3">
                  {t("yourLink")}
                </div>
                <a
                  href={mine.pathUrl ?? mine.url}
                  target="_blank"
                  rel="noreferrer"
                  dir="ltr"
                  className="mt-1 block break-all font-mono text-[13px] text-indigo underline-offset-2 hover:underline"
                >
                  {mine.url}
                </a>
                {!mine.rootDomain ? null : (
                  <p className="mt-1.5 text-[12px] text-ink-3">
                    {t("willBeSubdomain", { root: mine.rootDomain, url: mine.url })}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild type="button" variant="outline" size="sm">
                    <a href={mine.pathUrl ?? mine.url} target="_blank" rel="noreferrer">
                      <ExternalLink className="size-4" />
                      {t("open")}
                    </a>
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={copy}>
                    <Copy className="size-4" />
                    {t("copy")}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-[13px] text-ink-3">{t("noHandle")}</p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                disabled={saving || !normalized || unchanged || status.state !== "ok"}
              >
                {saving ? <Spinner /> : <Save className="size-4" />}
                {t("save")}
              </Button>
              {mine.handle ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={saving}
                  onClick={remove}
                  className="text-red"
                >
                  <Trash2 className="size-4" />
                  {t("remove")}
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
