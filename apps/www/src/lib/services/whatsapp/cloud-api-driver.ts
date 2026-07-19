import type { SendTemplateInput, SendTemplateResult, WhatsAppDriver } from "./types";

/**
 * Meta WhatsApp Business Cloud API driver. Selected only when
 * WHATSAPP_MODE=live; requires WHATSAPP_TOKEN + WHATSAPP_PHONE_ID (and the
 * templates in templates.ts approved under those exact names). Until the
 * business number is verified, run mock mode.
 */
export const cloudApiWhatsAppDriver: WhatsAppDriver = {
  name: "cloud_api",
  async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneId = process.env.WHATSAPP_PHONE_ID;
    const version = process.env.WHATSAPP_API_VERSION ?? "v20.0";
    if (!token || !phoneId) {
      return { ok: false, error: "WHATSAPP_TOKEN / WHATSAPP_PHONE_ID not configured", raw: null };
    }

    const payload = {
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.template,
        language: { code: input.locale === "ar" ? "ar" : "en" },
        components: [
          {
            type: "body",
            parameters: input.params.map((text) => ({ type: "text", text })),
          },
        ],
      },
    };

    try {
      const res = await fetch(
        `https://graph.facebook.com/${version}/${phoneId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const body = (await res.json().catch(() => null)) as any;
      if (!res.ok) {
        return {
          ok: false,
          error: body?.error?.message ?? `Cloud API HTTP ${res.status}`,
          raw: body,
        };
      }
      const providerMessageId = body?.messages?.[0]?.id;
      if (!providerMessageId) {
        return { ok: false, error: "Cloud API response missing message id", raw: body };
      }
      return { ok: true, providerMessageId, raw: body };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "network error", raw: null };
    }
  },
};
