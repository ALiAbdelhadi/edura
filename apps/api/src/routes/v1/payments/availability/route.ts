import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { PUBLIC_CACHE, withPublicCache } from "@repo/server-core/http/public-cache";
import { onlineCheckoutAvailable } from "@repo/server-core/services/payments/gateway/index";

export const GET = withPublicCache(
  withErrors(async () => ok({ online: onlineCheckoutAvailable() })),
  PUBLIC_CACHE.deployment,
);
