import { runAfter } from "@repo/server-core/http/after";
import { onAdminAudit } from "@repo/server-core/audit/admin-audit";
import {
  datasetsForAuditTarget,
  type PublicDataset,
} from "@repo/server-core/cache/public-data";
import { erpBaseUrl } from "@repo/server-core/backoffice/erp-base-url";

// Tells the ERP which of its public caches a back-office write just changed.
//
// WHY THE AUDIT LOG. Every back-office write is audited through
// writeAdminAudit — including the catalog service in server-core, which does not
// go through this app's admin-audit shim — so hooking the audit writer reaches
// every write that could change a public listing, without a list of routes that
// would silently go stale the day someone adds one.
//
// WHY `after()`. The listener fires INSIDE the write's transaction. Posting then
// would let the ERP refill its cache from the pre-commit rows, and the edit would
// sit invisible for a whole revalidate window. `after()` runs once the response
// has been sent, which is after the commit.
//
// BEST-EFFORT BY DESIGN. The ERP's own 60s bound is the guarantee; this only
// makes an edit appear sooner. So it never throws, never delays the admin's
// response, and a failure is logged and dropped. If INTERNAL_API_SECRET is not
// set on this project it does nothing at all (and says so once).
//
// Several audited writes in one request (a bulk action) are coalesced into one
// POST.

const pending = new Set<PublicDataset>();
let flushScheduled = false;
let warnedMissingSecret = false;

async function flush(): Promise<void> {
  flushScheduled = false;
  const datasets = [...pending];
  pending.clear();
  if (datasets.length === 0) return;

  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.warn(
        "[erp-revalidate] INTERNAL_API_SECRET is not set; back-office edits reach the ERP's public caches only through their 60s bound",
      );
    }
    return;
  }
  try {
    const res = await fetch(`${erpBaseUrl()}/api/v1/internal/revalidate`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ datasets }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error(`[erp-revalidate] ERP answered ${res.status} for`, datasets);
  } catch (err) {
    console.error("[erp-revalidate] could not reach the ERP", err);
  }
}

export function scheduleErpRevalidate(datasets: PublicDataset[]): void {
  for (const d of datasets) pending.add(d);
  if (flushScheduled || pending.size === 0) return;
  flushScheduled = true;
  try {
    runAfter(flush);
  } catch {
    // Outside a request (a script, a test) there is no response to wait for and
    // no transaction still open in this request, so flushing on the next tick is
    // the nearest equivalent.
    void Promise.resolve().then(flush);
  }
}

let registered = false;

// Called once, from instrumentation.ts.
export function registerErpRevalidation(): void {
  if (registered) return;
  registered = true;
  onAdminAudit((spec) => {
    const datasets = datasetsForAuditTarget(spec.targetType);
    if (datasets.length > 0) scheduleErpRevalidate(datasets);
  });
}
