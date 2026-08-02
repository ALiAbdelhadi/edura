import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@repo/observability";

// Edge runtime (proxy.ts / any `runtime = "edge"` route).
Sentry.init(sharedSentryOptions("edge"));
