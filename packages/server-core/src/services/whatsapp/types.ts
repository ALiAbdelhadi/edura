export type WhatsAppMode = "mock" | "live";

export function whatsappMode(): WhatsAppMode {
  const raw = (process.env.WHATSAPP_MODE ?? "mock").toLowerCase();
  return raw === "live" ? "live" : "mock";
}

export type SendTemplateInput = {
  to: string;
  template: string;
  params: string[];
  locale: "ar" | "en";
};

export type SendTemplateResult =
  | { ok: true; providerMessageId: string; raw: unknown }
  | { ok: false; error: string; raw: unknown };

export interface WhatsAppDriver {
  readonly name: "mock" | "cloud_api";
  sendTemplate(input: SendTemplateInput): Promise<SendTemplateResult>;
}
