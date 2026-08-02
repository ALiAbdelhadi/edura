export { dataProvider } from "./data-provider";
// Also exported here for discoverability, but screens should import it from
// "./as-array" directly — this barrel drags the whole provider stack in.
export { asArray } from "./as-array";
export { authProvider, type MeResponse } from "./auth-provider";
export { useAppRouterProvider } from "./router-provider";
