"use client";

import { useCustom } from "@refinedev/core";
import { useTranslations } from "next-intl";
import { DelegationStrip } from "@repo/ui/components/delegation-strip";

/**
 * The assistant portal's scope line.
 *
 * Every assistant write is already audited as "assistant X on behalf of teacher
 * Y". This states it BEFORE the audit log does — an actor who has to open a log
 * to learn whose books they are writing in has been told too late.
 *
 * It is NOT impersonation. The assistant is signed in as themselves and messages
 * as themselves (chat-scope forbids an adult appearing to a minor under another
 * identity); this states delegated AUTHORITY, which is why the copy says "acting
 * on behalf of" and never "signed in as".
 *
 * It loads eagerly, against the on-demand-reads default, and deliberately: this
 * is the scope every figure and every write on the screen belongs to, so a
 * reader arriving and NOT seeing it is the failure case. That is the exception
 * the rule names.
 *
 * `actingTeacherName` is a UI HINT ONLY — every request re-resolves the link
 * server-side, so a revoked assistant is gated on the next request no matter
 * what this last cached.
 */
export function AssistantDelegationStrip() {
  const t = useTranslations("delegation");
  const { result } = useCustom({ url: "me", method: "get" });

  // refine hands back a FROZEN PLACEHOLDER object while the query is idle, so
  // `result.data` is `{}` and not `undefined` — narrow on the VALUE, never on
  // the generic. Trusting the type here is what produced the first-paint
  // crashes this codebase has already paid for once.
  const data = result?.data as { actingTeacherName?: unknown } | undefined;
  const principal =
    typeof data?.actingTeacherName === "string" ? data.actingTeacherName.trim() : "";

  // An unlinked assistant resolves to no teacher, and so does the first paint.
  // Render nothing rather than a strip reading "acting on behalf of ——":
  // chrome that names an empty principal is worse than no chrome, because it
  // asserts a delegation the screen cannot actually name.
  if (!principal) return null;

  return <DelegationStrip label={t("actingOnBehalfOf")} principal={principal} />;
}
