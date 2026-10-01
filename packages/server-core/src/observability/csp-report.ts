// CSP violation reports, parsed here so both hosts read the wire formats the
// same way. server-core carries no Sentry SDK: the host registers a reporter
// that forwards the finished capture to its own SDK (the Next app to
// @sentry/nextjs, the service to @sentry/node); until one is registered the
// capture is logged and dropped.

type Normalised = {
  documentUri: string;
  blockedUri: string;
  violatedDirective: string;
  effectiveDirective: string;
  sourceFile: string;
  lineNumber: number | null;
  disposition: string;
};

export type CspCapture = {
  message: string;
  level: "warning" | "info";
  tags: { csp_directive: string; csp_disposition: string };
  extra: Normalised & { userAgent: string };
  fingerprint: string[];
};

export type CspReporter = (capture: CspCapture) => void;

let reporter: CspReporter = () => undefined;

export function setCspReporter(next: CspReporter): void {
  reporter = next;
}

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

    reporter({
      message: `CSP ${r.effectiveDirective || "violation"}: ${r.blockedUri}`,
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
