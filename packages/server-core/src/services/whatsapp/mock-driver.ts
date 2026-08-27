import type { SendTemplateInput, SendTemplateResult, WhatsAppDriver } from "./types";
import { renderTemplate, type TemplateKey, WHATSAPP_TEMPLATES } from "./templates";
import { randomBytes } from "node:crypto";

export const mockWhatsAppDriver: WhatsAppDriver = {
  name: "mock",
  async sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult> {
    const key = (Object.keys(WHATSAPP_TEMPLATES) as TemplateKey[]).find(
      (k) => WHATSAPP_TEMPLATES[k].name === input.template,
    );
    const rendered = key ? renderTemplate(key, input.locale, input.params) : "(unknown template)";
    const providerMessageId = `wamid.MOCK-${randomBytes(12).toString("hex")}`;
    console.log(
      `[whatsapp:mock] -> ${input.to} [${input.template}/${input.locale}]\n${rendered}`,
    );
    return {
      ok: true,
      providerMessageId,
      raw: { mock: true, rendered },
    };
  },
};
