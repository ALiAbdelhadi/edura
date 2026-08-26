"use client";
import { useEffect, useState, type ReactNode } from "react";
import { useCustom, useCustomMutation } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@repo/ui/components/dialog";
import { LedgerButton } from "@/components/ledger";
import { asKey } from "@/lib/i18n/keys";

type PrefsShape = { tourCompleted?: boolean };

export function FirstRunTour({
  render,
  namespace = "teacher.teacherEmulator.firstRun",
}: {
  render: (done: () => void) => ReactNode;
  namespace?: string;
}) {
  const t = useTranslations(asKey(namespace));
  const { query, result } = useCustom<PrefsShape>({ url: "me/prefs", method: "get" });
  const { mutateAsync: savePrefs } = useCustomMutation();

  const [open, setOpen] = useState(false);
  const [started, setStarted] = useState(false);

  const payload = (result as { data?: PrefsShape } | undefined)?.data ?? (result as PrefsShape);
  const completed = typeof payload?.tourCompleted === "boolean" ? payload.tourCompleted : null;

  useEffect(() => {
    if (query.isSuccess && completed === false) setOpen(true);
  }, [query.isSuccess, completed]);

  const done = () => {
    setOpen(false);
    setStarted(false);
    void savePrefs({ url: "me/prefs", method: "patch", values: { tourCompleted: true } }).catch(
      () => {
        /* Rule 3: the tour may offer itself once more; nothing else breaks. */
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) done();
      }}
    >
      <DialogContent
        className={started ? "max-h-[92vh] max-w-5xl overflow-y-auto" : "max-w-lg"}
      >
        {started ? (
          render(done)
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("title")}</DialogTitle>
            </DialogHeader>
            <p className="text-sm" style={{ color: "var(--ink-2)" }}>
              {t("body")}
            </p>
            <p className="text-xs" style={{ color: "var(--ink-3)" }}>
              {t("reopenHint")}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <LedgerButton variant="primary" onClick={() => setStarted(true)}>
                {t("start")}
              </LedgerButton>
              <LedgerButton onClick={done}>{t("later")}</LedgerButton>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}