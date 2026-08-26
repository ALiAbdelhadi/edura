import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { onlineCheckoutAvailable } from "@/lib/services/payments/gateway";

export const dynamic = "force-dynamic";

/**
 * MVP blocker #2: whether the app may OFFER an online checkout right now.
 * One boolean, no auth (it leaks nothing), read by every online-payment CTA
 * so a dead button is ABSENT rather than present-and-failing (D-027). The
 * initiators assert the same predicate server-side — this endpoint informs
 * the UI, it never authorizes anything.
 */
export const GET = withErrors(async () => ok({ online: onlineCheckoutAvailable() }));
