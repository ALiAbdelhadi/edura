import type { ProvenanceFilter } from "@repo/server-core/services/reports/reports";

export function parseProvenance(url: URL): ProvenanceFilter | undefined {
  const systemStatus = url.searchParams.get("systemStatus");
  const dataSource = url.searchParams.get("dataSource");

  const filter: ProvenanceFilter = {
    systemStatus:
      systemStatus === "external" || systemStatus === "enrolled" ? systemStatus : null,
    dataSource: dataSource === "manual" || dataSource === "system" ? dataSource : null,
  };

  return filter.systemStatus || filter.dataSource ? filter : undefined;
}
