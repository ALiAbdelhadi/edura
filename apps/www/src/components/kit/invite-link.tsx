"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Check, Copy, Link2, MailCheck, MailX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type InviteDelivery = "sent" | "failed" | "skipped" | "no_recipient";

export function InviteLink({
  link,
  delivery,
  to,
}: {
  link: string;
  delivery: InviteDelivery;
  to?: string | null;
}) {
  const t = useTranslations();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked (insecure origin, permissions). The input is
      // right there and selectable, so this is not worth an error toast.
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Link2 className="size-4" />
        {t("invite.linkTitle")}
      </div>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        {delivery === "sent" ? (
          <>
            <MailCheck className="mt-0.5 size-3.5 shrink-0" />
            <span>{t("invite.emailSent", { email: to ?? "" })}</span>
          </>
        ) : (
          <>
            <MailX className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {delivery === "no_recipient"
                ? t("invite.emailNoRecipient")
                : t("invite.emailNotSent")}
            </span>
          </>
        )}
      </p>
      <div className="flex items-center gap-2">
        <Input readOnly dir="ltr" value={link} className="font-mono text-xs" />
        <Button type="button" variant="outline" size="icon" onClick={copy}>
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("invite.linkHint")}</p>
    </div>
  );
}
