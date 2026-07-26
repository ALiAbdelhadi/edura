// =============================================================================
// Invite delivery — EMAIL is the primary channel (2026-07-25).
//
// WhatsApp is not deleted, it is DEMOTED. We have no verified Meta business
// number yet, so `sendWhatsApp` runs against the mock driver and delivers
// nothing real; email (SMTP, @repo/server-core/mail) actually reaches people
// today. The channel set is an env knob, so the day Meta verification lands
// this becomes `INVITE_CHANNELS=email,whatsapp` and no code changes.
// =============================================================================

import { sendMail } from "../../mail/send";
import { sendWhatsApp } from "../../services/whatsapp/send";
import type { TemplateKey } from "../../services/whatsapp/templates";
import { inviteTtlMs } from "./invite-token";

export type ChannelStatus = "sent" | "failed" | "skipped" | "no_recipient";

export type DeliveryResult = {
  status: ChannelStatus;
  /** Never contains the token — see redactToken at the call sites. */
  error?: string;
};

export type InviteChannel = "email" | "whatsapp";

/** Default `email`. Comma-separated, unknown names ignored. */
export function inviteChannels(): Set<InviteChannel> {
  const raw = (process.env.INVITE_CHANNELS ?? "email").toLowerCase();
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is InviteChannel => s === "email" || s === "whatsapp");
  return new Set(parsed.length ? parsed : ["email"]);
}

export function inviteExpiryDays(): number {
  return Math.max(1, Math.round(inviteTtlMs() / (24 * 60 * 60 * 1000)));
}

/**
 * Send one invite email.
 *
 * NEVER THROWS — `sendMail` already guarantees that, and it matters here: a
 * dead SMTP host must not roll back a walk-in registration or a staff hire.
 * `sent: false` in console mode is the expected dev/test outcome, not an error.
 */
export async function deliverInviteEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<DeliveryResult> {
  const res = await sendMail(input);
  if (res.sent) return { status: "sent" };
  return { status: "failed", ...(res.error ? { error: res.error } : {}) };
}

/**
 * Optional WhatsApp leg. Returns `skipped` — not `failed` — when the channel is
 * off, so a caller can tell "we chose not to" from "we tried and it broke".
 */
export async function deliverInviteWhatsApp(input: {
  to: string | null | undefined;
  template: TemplateKey;
  params: string[];
  locale?: "ar" | "en";
  userId?: string;
  centerId?: string;
  createdBy?: string;
}): Promise<DeliveryResult> {
  if (!inviteChannels().has("whatsapp")) return { status: "skipped" };
  if (!input.to) return { status: "no_recipient" };
  const { to, ...rest } = input;
  const wa = await sendWhatsApp({ to, ...rest });
  return { status: wa.status, ...(wa.error ? { error: wa.error } : {}) };
}
