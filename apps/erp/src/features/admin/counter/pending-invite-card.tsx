"use client";

import { InviteLink } from "@/components/kit/invite-link";
import { Button } from "@repo/ui/components/button";
import { useTranslations } from "next-intl";
import type { WalkInInvite } from "./walk-in-panel";

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
        <div className="rounded-lg border border-(--amber) bg-(--amber-soft) p-3">
          <p className="m-0 text-[13px] font-semibold text-(--amber)">
            {t("shared.checkin.guardianEmailMissingTitle")}
          </p>
          <p className="mt-1 mb-0 text-xs leading-relaxed text-(--ink-2)">
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
