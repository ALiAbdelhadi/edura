// Writes src/routes/index.ts from the route files under src/routes:
//   bun scripts/gen-routes.ts          (write)
//   bun scripts/gen-routes.ts --check  (exit 1 if index.ts is stale)
import { join } from "node:path";
import { runGenRoutes } from "@repo/service-kit/scripts/gen-routes";

runGenRoutes(join(import.meta.dir, "..", "src", "routes"));
