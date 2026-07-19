import type { TenantTx } from "@/lib/db/scope";
import { platformDb } from "@/lib/db/scope";
import { resolveWhatsAppDriver } from "./index";
import { WHATSAPP_TEMPLATES, type TemplateKey } from "./templates";

/** Mask token query params so a usable login token never lands in the log. */
function redactSecrets(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9._~-]+/g, "$1***");
}

export type SendWhatsAppInput = {
  /** E.164 recipient (normalize with normalizeEgyptPhone first). */
  to: string;
  template: TemplateKey;
  params: string[];
  locale?: "ar" | "en";
  /** Attribution (all optional). */
  userId?: string;
  centerId?: string;
  createdBy?: string;
};

/**
 * Send a WhatsApp template message and log the attempt. The row is written
 * BEFORE the provider call (status queued) and updated with the outcome, so
 * every attempt — mock included — is visible in the back-office log.
 *
 * Never throws on delivery failure: registration must not roll back because
 * a message didn't go out. Callers get the status back.
 */
export async function sendWhatsApp(
  input: SendWhatsAppInput,
  tx?: TenantTx,
): Promise<{ messageId: string; status: "sent" | "failed"; error?: string }> {
  const driver = resolveWhatsAppDriver();
  const templateName = WHATSAPP_TEMPLATES[input.template].name;
  const locale = input.locale ?? "ar";

  const createData = {
    recipientPhone: input.to,
    template: templateName,
    // Login secrets never persist in the log: claim links keep their shape but
    // the token itself is masked. The only durable copy of a token is the
    // HASHED invite_tokens row.
    params: input.params.map(redactSecrets),
    locale,
    status: "queued" as const,
    provider: driver.name,
    userId: input.userId ?? null,
    centerId: input.centerId ?? null,
    createdBy: input.createdBy ?? null,
  };

  const row = tx
    ? await tx.whatsAppMessage.create({ data: createData })
    : await platformDb((ptx) => ptx.whatsAppMessage.create({ data: createData }));

  // The driver gets the REAL params — redaction applies to the log only.
  const result = await driver.sendTemplate({
    to: input.to,
    template: templateName,
    params: input.params,
    locale,
  });

  // providerResponse can echo message content (the mock's rendered body does)
  // — scrub it the same way before persisting.
  const scrubbedRaw =
    result.raw == null
      ? result.raw
      : (JSON.parse(redactSecrets(JSON.stringify(result.raw))) as object);

  const updateData = result.ok
    ? {
        status: "sent" as const,
        providerMessageId: result.providerMessageId,
        providerResponse: scrubbedRaw as object,
      }
    : {
        status: "failed" as const,
        error: result.error,
        providerResponse: (scrubbedRaw ?? undefined) as object | undefined,
      };

  if (tx) await tx.whatsAppMessage.update({ where: { id: row.id }, data: updateData });
  else await platformDb((ptx) => ptx.whatsAppMessage.update({ where: { id: row.id }, data: updateData }));

  return result.ok
    ? { messageId: row.id, status: "sent" }
    : { messageId: row.id, status: "failed", error: result.error };
}
