import { sendMail } from "../transport/smtp";
import { renderEmail } from "../render";
import { getTemplate } from "../templates/registry";
import { writePreview } from "../preview";
import type {
  ChannelResult,
  NotificationChannel,
  Recipient,
  TemplateData,
  TemplateId,
} from "../types";

// =============================================================================
// EMAIL channel — the only channel shipped today.
//
// It owns rendering and recipient resolution; it does NOT own transport. The
// wire is @repo/server-core/mail/send: provider-agnostic nodemailer over SMTP,
// which is a binding project decision (see CLAUDE.md) because paying past a
// vendor's free tier needs an international card, and that is the real problem
// from Egypt — not the vendor.
//
// "Use Resend" is therefore an ENV change, not a code change: point
// MAIL_PROVIDER=smtp at smtp.resend.com with an API-key password. Any other
// SMTP host (Brevo, Zoho, Gmail, a self-hosted relay) is the same one-line
// swap, which is the whole point of not importing an SDK.
// =============================================================================

/**
 * Off switch. `NOTIFICATION_CHANNELS` mirrors the existing `INVITE_CHANNELS`
 * knob deliberately — one convention for "which channels are live", so the day
 * WhatsApp is verified both lists are turned on the same way.
 */
export function enabledChannelIds(): Set<string> {
  const raw = (process.env.NOTIFICATION_CHANNELS ?? "email").toLowerCase();
  const parsed = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set(parsed.length ? parsed : ["email"]);
}

export const emailChannel: NotificationChannel = {
  id: "email",

  isEnabled() {
    return enabledChannelIds().has("email");
  },

  supports(template: TemplateId) {
    return Boolean(getTemplate(template).email);
  },

  async send<T extends TemplateId>(
    template: T,
    to: Recipient,
    data: TemplateData<T>,
  ): Promise<ChannelResult> {
    if (!to.email) return { channel: "email", status: "no_recipient" };

    try {
      const { subject, html, text } = await renderEmail(template, to.locale, data);

      // Dev preview. Writes the rendered message somewhere a human can open it
      // and returns BEFORE any transport call — in preview mode nothing is ever
      // handed to a provider, which is the guarantee that matters when the data
      // is real. `writePreview` refuses to run in production.
      const preview = await writePreview({ template, to: to.email, subject, html, text });
      if (preview.previewed) {
        return { channel: "email", status: "skipped", messageId: preview.path };
      }

      const res = await sendMail({ to: to.email, subject, html, text });
      if (res.sent) {
        return {
          channel: "email",
          status: "sent",
          ...(res.messageId ? { messageId: res.messageId } : {}),
        };
      }
      // `sendMail` returns sent:false with NO error in console mode — that is
      // the dev default and a deliberate non-send, not a fault.
      return res.error
        ? { channel: "email", status: "failed", error: res.error }
        : { channel: "email", status: "skipped" };
    } catch (err) {
      // Rendering is the only thing here that can throw (sendMail never does).
      // A template bug must not take down the flow that triggered it.
      return {
        channel: "email",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
