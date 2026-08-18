export { dataProvider } from "./data-provider";
// Also exported here for discoverability, but screens should import them from
// "./as-array" / "./as-record" directly — this barrel drags the whole provider
// stack in.
export { asArray } from "./as-array";
export { asRecord, asData } from "./as-record";
export { authProvider, type MeResponse } from "./auth-provider";
export { useAppRouterProvider } from "./router-provider";
