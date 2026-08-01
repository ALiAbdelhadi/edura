import type { TemplateId } from "./types";

// =============================================================================
// Dev preview mode — render and show, never send.
//
// Turned on by NOTIFICATIONS_PREVIEW=1. When on, the email channel writes the
// rendered HTML to disk and logs the path INSTEAD of calling the transport, so
// a developer can open a real Arabic RTL render in a browser without a single
// message leaving the machine.
//
// HARD REFUSAL IN PRODUCTION: preview mode is a *silent* non-send. If someone
// ever set the flag on a production deploy, every password reset and receipt
// would vanish into a temp directory while the app reported success. So it is
// ignored in production and says so, loudly, once.
// =============================================================================

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

/**
 * Write one rendered message to `NOTIFICATIONS_PREVIEW_DIR` (default
 * `.notifications-preview/`). Returns `{ previewed: false }` when preview mode
 * is off, which is the signal for the caller to proceed with real transport.
 *
 * Never throws: a read-only filesystem must not break a send path. If the write
 * fails we log and fall through to the transport — the flag is a developer
 * convenience, not a safety mechanism (the production refusal above is).
 */
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

    const dir = resolve(process.env.NOTIFICATIONS_PREVIEW_DIR ?? PREVIEW_DIR_DEFAULT);
    await mkdir(dir, { recursive: true });

    // Recipient in the filename, sanitized — it is what you scan for when you
    // are looking for "the mail that was supposed to go to that account".
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
