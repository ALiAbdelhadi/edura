import type { WhatsAppDriver } from "./types";
import { whatsappMode } from "./types";
import { mockWhatsAppDriver } from "./mock-driver";
import { cloudApiWhatsAppDriver } from "./cloud-api-driver";

export type { WhatsAppDriver, SendTemplateInput, SendTemplateResult } from "./types";
export { whatsappMode } from "./types";
export { WHATSAPP_TEMPLATES, renderTemplate, type TemplateKey } from "./templates";
export { normalizeEgyptPhone } from "./phone";
export { sendWhatsApp } from "./send";

export function resolveWhatsAppDriver(): WhatsAppDriver {
  return whatsappMode() === "mock" ? mockWhatsAppDriver : cloudApiWhatsAppDriver;
}
