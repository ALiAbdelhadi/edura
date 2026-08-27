import { sendMail } from "../../mail/send";
import { sendWhatsApp } from "../../services/whatsapp/send";
import type { TemplateKey } from "../../services/whatsapp/templates";
import { inviteTtlMs } from "./invite-token";

export type ChannelStatus = "sent" | "failed" | "skipped" | "no_recipient";

export type DeliveryResult = {
  status: ChannelStatus;
  error?: string;
};

export type InviteChannel = "email" | "whatsapp";

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
