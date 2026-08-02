// Shim, same precedent as blacklist.ts / collaboration.ts: the implementation
// lives in the shared kernel so www can READ a flag through the identical code
// path the back office WRITES through. Two implementations of "is this on?"
// is how a kill switch ends up half-flipped.
export {
  KNOWN_FEATURE_FLAGS,
  clearFeatureFlagCache,
  isFeatureEnabled,
  listFeatureFlags,
  readFeatureFlags,
  setFeatureFlag,
  type FlagRow,
} from "@repo/server-core/services/platform/feature-flags";
