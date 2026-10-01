import { createAdminAuth } from "@repo/server-core/backoffice-auth/create-auth";
import { setAdminAuth } from "@repo/server-core/backoffice-auth/instance";

// apps/admin-api builds this same instance for the service (plus its own cookie
// plugin). The DB suites run outside both hosts, so they bind the bare
// server-core instance — the same options, door, sealed admin prefix and 2FA
// — and any suite that reaches the session reader or the sign-in door imports
// this first.
export const auth = createAdminAuth({ extraPlugins: [] });
setAdminAuth(auth);
