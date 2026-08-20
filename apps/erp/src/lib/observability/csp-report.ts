import * as Sentry from "@sentry/nextjs";

/**
 * Parse and record one CSP violation report.
 *
 * TWO WIRE FORMATS, because browsers disagree and both are still in the field:
 *   • `report-uri`  → `{"csp-report": { "document-uri", "blocked-uri", ... }}`
 *     with `Content-Type: application/csp-report`. Legacy, still what Safari
 *     and older Chrome send.
 *   • `report-to`   → `[{ "type": "csp-violation", "body": { documentURL,
 *     blockedURL, ... } }]` with `application/reports+json`. The Reporting API
 *     successor, and it batches, so ONE request can carry many reports.
 * Both are normalised to the same shape here so the log has one format to read.
 *
 * NOISE IS THE ENEMY OF THIS FEATURE. Browser extensions inject scripts into
 * every page and generate violations that are not the site's bug; a report
 * stream that is 95% extension noise gets muted, and then the real violation
 * arrives and nobody is listening. Reports whose blocked URI is an extension
 * scheme are dropped before they reach Sentry.
 */

type Normalised = {
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  sourceFile: string;
  lineNumber: number | null;
  disposition: string;
};

/** Extension schemes — the browser's own noise, never the application's bug. */
const EXTENSION_SCHEMES = [
  "chrome-extension:",
  "moz-extension:",
  "safari-extension:",
  "safari-web-extension:",
  "webkit-masked-url:",
];

function isExtensionNoise(blockedUri: string): boolean {
  const v = blockedUri.toLowerCase();
  return EXTENSION_SCHEMES.some((s) => v.startsWith(s));
}

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function normaliseOne(raw: unknown): Normalised | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  // report-to / Reporting API shape
  if (str(o.type) === "csp-violation" && o.body && typeof o.body === "object") {
    const b = o.body as Record<string, unknown>;
    return {
      documentUri: str(b.documentURL),
      blockedUri: str(b.blockedURL, "inline"),
      violatedDirective: str(b.effectiveDirective),
      effectiveDirective: str(b.effectiveDirective),
      sourceFile: str(b.sourceFile),
      lineNumber: typeof b.lineNumber === "number" ? b.lineNumber : null,
      disposition: str(b.disposition, "unknown"),
    };
  }

  // report-uri shape
  const c = (o["csp-report"] ?? o) as Record<string, unknown>;
  const documentUri = str(c["document-uri"]);
  if (!documentUri && !c["violated-directive"]) return null;
  return {
    documentUri,
    blockedUri: str(c["blocked-uri"], "inline"),
    violatedDirective: str(c["violated-directive"]),
    effectiveDirective: str(c["effective-directive"], str(c["violated-directive"])),
    sourceFile: str(c["source-file"]),
    lineNumber: typeof c["line-number"] === "number" ? (c["line-number"] as number) : null,
    disposition: str(c.disposition, "unknown"),
  };
}

export function captureCspReport(rawBody: string, userAgent: string | null): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return; // a body we cannot read is not worth an alert
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  for (const item of items) {
    const r = normaliseOne(item);
    if (!r) continue;
    if (isExtensionNoise(r.blockedUri)) continue;

    // eslint-disable-next-line no-console
    console.warn(
      `[csp] ${r.disposition} ${r.effectiveDirective || "?"} blocked=${r.blockedUri} on ${r.documentUri}` +
        (r.sourceFile ? ` (${r.sourceFile}:${r.lineNumber ?? "?"})` : ""),
    );

    // Grouped by directive + blocked URI, NOT by document: the same missing
    // allowlist entry fires on every page, and one issue per page would bury
    // the signal it is supposed to surface.
    Sentry.captureMessage(`CSP ${r.effectiveDirective || "violation"}: ${r.blockedUri}`, {
      level: r.disposition === "enforce" ? "warning" : "info",
      tags: {
        csp_directive: r.effectiveDirective || "unknown",
        csp_disposition: r.disposition,
      },
      extra: { ...r, userAgent: userAgent ?? "" },
      fingerprint: ["csp", r.effectiveDirective || "unknown", r.blockedUri],
    });
  }
}
