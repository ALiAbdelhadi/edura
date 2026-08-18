import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@repo/observability";

// Server runtime (Node). Thin on purpose — the PII posture, sampling and
// scrubbing all live in @repo/observability so apps/www and apps/superadmin
// cannot drift apart on them.
//
// No DSN => `enabled: false` and this is a no-op. Local dev and CI send nothing
// without anyone remembering to turn it off.
Sentry.init({
  ...sharedSentryOptions("server"),
  // Server stack frames are ours; the browser's may not be (extensions).
  // `denyUrls` is therefore client-only and comes from the shared options.
});
