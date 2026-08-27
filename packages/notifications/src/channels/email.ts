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
      return res.error
        ? { channel: "email", status: "failed", error: res.error }
        : { channel: "email", status: "skipped" };
    } catch (err) {
      return {
        channel: "email",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};
