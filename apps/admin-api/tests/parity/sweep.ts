import { fileURLToPath } from "node:url";
import { sweepRoutes as sweep, type SweepRoute, type SweepSkip } from "@repo/service-kit/parity/sweep";
import { ROUTES } from "../../src/routes";

export { DUMMY_ID, DUMMY_SEGMENT, type SweepRoute, type SweepSkip } from "@repo/service-kit/parity/sweep";

const routesDir = fileURLToPath(new URL("../../src/routes/", import.meta.url));

export function sweepRoutes(): { routes: SweepRoute[]; skipped: SweepSkip[] } {
  return sweep(ROUTES, routesDir);
}
