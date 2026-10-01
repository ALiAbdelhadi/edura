import { withErrors } from "@repo/server-core/errors/http";
import { ok } from "@repo/server-core/http/envelope";
import { getPricingExamples } from "@repo/server-core/services/pricing/public-rates";

export const GET = withErrors(async () => ok(await getPricingExamples()));
