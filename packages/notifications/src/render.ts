import { render } from "@react-email/render";
import { normalizeLocale } from "./locale";
import { getTemplate } from "./templates/registry";
import type { RenderedEmail, TemplateData, TemplateId } from "./types";

/**
 * Render one template to a complete email.
 *
 * Pure: no env reads, no I/O, no side effects — which is what makes it testable
 * and what makes the mail-preview script safe to point at production data.
 *
 * `text` comes from the template's own plain-text writer rather than from
 * stripping tags off the HTML. Auto-stripped text reads like debris (a bare URL
 * three lines below the sentence that referenced it), and a bad text/plain part
 * is worse for deliverability than a good one is better.
 */
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
