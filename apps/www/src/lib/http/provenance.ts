import type { ProvenanceFilter } from "@repo/server-core/services/reports/reports";

/**
 * Parse the off-system-teacher report filters off a query string.
 *
 * ONE parser for every report route, so the parameter names and the
 * default cannot drift between them.
 *
 * THE DEFAULT IS COMBINED. An absent or unrecognised value yields `null` for
 * that dimension, which the report layer reads as "do not narrow" — so a
 * request that says nothing gets on-platform and off-system teachers together,
 * exactly as every one of these reports behaved before the filter existed.
 * Unknown values fall back to combined rather than erroring: a stale bookmark
 * should show the whole center, not a 400.
 */
export function parseProvenance(url: URL): ProvenanceFilter | undefined {
  const systemStatus = url.searchParams.get("systemStatus");
  const dataSource = url.searchParams.get("dataSource");

  const filter: ProvenanceFilter = {
    systemStatus:
      systemStatus === "external" || systemStatus === "enrolled" ? systemStatus : null,
    dataSource: dataSource === "manual" || dataSource === "system" ? dataSource : null,
  };

  // `undefined` rather than an all-null object, so the report layer's
  // "unfiltered" fast path is taken and no extra query runs for the common case.
  return filter.systemStatus || filter.dataSource ? filter : undefined;
}
