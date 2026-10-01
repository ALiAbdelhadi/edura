import { createErpAuth } from "@repo/server-core/erp-auth/create-auth";
import { setErpAuth } from "@repo/server-core/erp-auth/instance";

// The ERP host builds this same instance in src/lib/auth/auth.ts (plus nextCookies()
// for server actions, which has no meaning outside a Next request). The DB suites
// run outside Next, so they bind the bare server-core instance — including its
// invite-token and view-as plugins — and any suite that reaches the session reader
// or the sign-in door imports this first.
export const auth = createErpAuth({ extraPlugins: [] });
setErpAuth(auth);
