import * as Sentry from "@sentry/nextjs";
import { sharedSentryOptions } from "@repo/observability";

Sentry.init({
  ...sharedSentryOptions("server"),
});
