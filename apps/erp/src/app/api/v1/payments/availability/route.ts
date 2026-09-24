import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@/lib/http/public-cache";
import { onlineCheckoutAvailable } from "@/lib/services/payments/gateway";

export const dynamic = "force-dynamic";

export const GET = withPublicCache(
  withErrors(async () => ok({ online: onlineCheckoutAvailable() })),
  PUBLIC_CACHE.deployment,
);
