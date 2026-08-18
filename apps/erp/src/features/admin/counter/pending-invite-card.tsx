"use client";

import { InviteLink } from "@/components/kit/invite-link";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import type { WalkInInvite } from "./walk-in-panel";

/**
 * The one-time claim link, once a walk-in (or a resend) has produced one.
 *
 * Shared by both counter surfaces because the guardian-email notice is a
 * child-safety disclosure, not decoration: it states what is still owed and,
 * as importantly, what is NOT affected. A second copy of that copy is a second
 * chance for the two to say different things.
 */
export function PendingInviteCard({
  invite,
  onDone,
}: {
  invite: WalkInInvite;
  onDone: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="flex flex-col gap-2">
      {invite.guardianEmailRequired ? (
        // Not an error — a protection being applied. Amber, and it says
        // exactly what still works (classes, payments) and what does not.
        <div className="rounded-lg border border-[var(--amber)] bg-[var(--amber-soft)] p-3">
          <p className="m-0 text-[13px] font-semibold text-[var(--amber)]">
            {t("shared.checkin.guardianEmailMissingTitle")}
          </p>
          <p className="mt-1 mb-0 text-xs leading-relaxed text-[var(--ink-2)]">
            {t("shared.checkin.guardianEmailMissingBody", { name: invite.name })}
          </p>
        </div>
      ) : null}
      <InviteLink link={invite.link} delivery={invite.delivery} />
      <Button variant="ghost" className="h-11 self-start text-[13px]" onClick={onDone}>
        {t("invite.done")}
      </Button>
    </div>
  );
}
