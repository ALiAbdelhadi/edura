import { withRateLimit } from "@repo/server-core/rate-limit/middleware";
import { captureCspReport } from "@repo/server-core/observability/csp-report";

const MAX_BODY_BYTES = 16 * 1024;

async function handle(req: Request): Promise<Response> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return new Response(null, { status: 204 });
  }
  if (raw.length > MAX_BODY_BYTES) raw = raw.slice(0, MAX_BODY_BYTES);

  captureCspReport(raw, req.headers.get("user-agent"));
  return new Response(null, { status: 204 });
}

export const POST = withRateLimit(handle, 60, 60);
