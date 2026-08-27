import { render } from "@react-email/render";
import { normalizeLocale } from "./locale";
import { getTemplate } from "./templates/registry";
import type { RenderedEmail, TemplateData, TemplateId } from "./types";

export async function renderEmail<T extends TemplateId>(
  template: T,
  locale: string | null | undefined,
  data: TemplateData<T>,
): Promise<RenderedEmail> {
  const loc = normalizeLocale(locale);
  const def = getTemplate(template);
  const { Body, subject, text } = def.email;

  const html = await render(Body({ locale: loc, data }), { pretty: false });

  return {
    subject: subject(loc, data),
    html,
    text: text(loc, data),
  };
}
