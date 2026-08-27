import { withErrors } from "@/lib/errors/http";
import { ok } from "@/lib/http/envelope";
import { onlineCheckoutAvailable } from "@/lib/services/payments/gateway";

export const dynamic = "force-dynamic";

export const GET = withErrors(async () => ok({ online: onlineCheckoutAvailable() }));
