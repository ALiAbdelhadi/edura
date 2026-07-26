export type WhatsAppMode = "mock" | "live";

export function whatsappMode(): WhatsAppMode {
  const raw = (process.env.WHATSAPP_MODE ?? "mock").toLowerCase();
  return raw === "live" ? "live" : "mock";
}

/**
 * Template-message send request. Deliberately template-only: Meta requires
 * pre-approved templates for business-initiated messages, and a future OTP /
 * phone-verification flow is just another template + call site — no interface
 * change needed (OTP itself is out of scope this phase).
 */
export type SendTemplateInput = {
  /** E.164 recipient, e.g. +2010XXXXXXXX (normalize before calling). */
  to: string;
  /** Template name as registered with Meta (see templates.ts). */
  template: string;
  /** Positional body parameters ({{1}}, {{2}}, …). */
  params: string[];
  /** Template language. */
  locale: "ar" | "en";
};

export type SendTemplateResult =
  | { ok: true; providerMessageId: string; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export interface WhatsAppDriver {
  readonly name: "mock" | "cloud_api";
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult>;
}
