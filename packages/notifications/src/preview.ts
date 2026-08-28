import type { TemplateId } from "./types";

const PREVIEW_DIR_DEFAULT = ".notifications-preview";

let warnedInProduction = false;

export function isPreviewMode(): boolean {
  const on = process.env.NOTIFICATIONS_PREVIEW === "1";
  if (!on) return false;
  if (process.env.NODE_ENV === "production") {
    if (!warnedInProduction) {
      warnedInProduction = true;
      console.warn(
        "[notifications] NOTIFICATIONS_PREVIEW=1 is IGNORED in production — refusing to silently swallow real mail. Unset it.",
      );
    }
    return false;
  }
  return true;
}

export type PreviewOutcome = { previewed: false } | { previewed: true; path: string };

export async function writePreview(input: {
  template: TemplateId;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<PreviewOutcome> {
  if (!isPreviewMode()) return { previewed: false };

  try {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join, resolve } = await import("node:path");

    // turbopackIgnore keeps this dev-only path out of the production trace.
    // isPreviewMode() returns false when NODE_ENV is production, so nothing
    // below line 31 ever runs there — but Turbopack cannot see that, and a
    // resolve() over a variable makes it trace the WHOLE project into the
    // server bundle, public folder included.
    const dir = resolve(/*turbopackIgnore: true*/ process.env.NOTIFICATIONS_PREVIEW_DIR ?? PREVIEW_DIR_DEFAULT);
    await mkdir(dir, { recursive: true });

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const who = input.to.replace(/[^a-zA-Z0-9._@-]/g, "_");
    const base = `${stamp}__${input.template}__${who}`;

    await writeFile(join(dir, `${base}.html`), input.html, "utf8");
    await writeFile(
      join(dir, `${base}.txt`),
      `To: ${input.to}\nSubject: ${input.subject}\n\n${input.text}\n`,
      "utf8",
    );

    const path = join(dir, `${base}.html`);
    // eslint-disable-next-line no-console
    console.log(`[notifications:preview] ${input.template} -> ${input.to}\n  ${path}`);
    return { previewed: true, path };
  } catch (err) {
    console.error(
      `[notifications:preview] could not write preview (${err instanceof Error ? err.message : String(err)}) — falling through to transport`,
    );
    return { previewed: false };
  }
}
