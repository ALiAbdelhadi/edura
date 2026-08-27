import type { TenantTx } from "../../db/scope";
import { platformDb } from "../../db/scope";
import { resolveWhatsAppDriver } from "./index";
import { WHATSAPP_TEMPLATES, type TemplateKey } from "./templates";

function redactSecrets(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9._~-]+/g, "$1***");
}

export type SendWhatsAppInput = {
  to: string;
  template: TemplateKey;
  params: string[];
  locale?: "ar" | "en";
  userId?: string;
  centerId?: string;
  createdBy?: string;
};

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

  const result = await driver.sendTemplate({
    to: input.to,
    template: templateName,
    params: input.params,
    locale,
  });

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
