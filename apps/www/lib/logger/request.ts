import { getSessionUser } from "@/lib/auth/session";

type RouteCtx = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteCtx) => Promise<Response> | Response;

/**
 * Structured request logger.
 * Logs: method, path, status, duration_ms, userId, centerId (when authenticated).
 */
export function withLogging(handler: Handler): Handler {
  return async (req, ctx) => {
    const start = Date.now();
    const url = new URL(req.url);

    let response: Response;
    try {
      response = await handler(req, ctx);
    } catch (err) {
      const ms = Date.now() - start;
      console.log(
        JSON.stringify({
          method: req.method,
          path: url.pathname,
          status: 500,
          ms,
          error: err instanceof Error ? err.message : String(err),
        }),
      );
      throw err;
    }

    const ms = Date.now() - start;
    // Best-effort auth context (may be null for anon routes)
    const user = await getSessionUser().catch(() => null);

    console.log(
      JSON.stringify({
        method: req.method,
        path: url.pathname,
        status: response.status,
        ms,
        ...(user && { userId: user.id, centerId: user.centerId }),
      }),
    );

    return response;
  };
}
