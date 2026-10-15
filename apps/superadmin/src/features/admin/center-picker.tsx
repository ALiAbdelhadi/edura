"use client";

import { useCustom } from "@refinedev/core";
import { QUERY_FRESHNESS } from "@repo/client-core/refine/freshness";
import { Combobox } from "@repo/ui/components/combobox";
import { useDebounced } from "@repo/ui/hooks/use-debounced";
import { useState } from "react";
import { asData } from "@/lib/refine/as-record";

type CenterRow = { id: string; name: string; status?: string };

export function CenterPicker({
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyText,
  enabled = true,
  exclude,
  activeOnly,
  id,
}: {
  value: string | null | undefined;
  onChange: (value: string | null, name?: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  enabled?: boolean;
  exclude?: (centerId: string) => boolean;
  activeOnly?: boolean;
  id?: string;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<{ value: string; label: string } | null>(null);
  const q = useDebounced(search.trim());
  const req = useCustom({
    url: "admin/centers",
    method: "get",
    config: {
      query: {
        limit: "50",
        ...(q ? { q } : {}),
        ...(activeOnly ? { status: "active" } : {}),
      },
    },
    queryOptions: { enabled, ...QUERY_FRESHNESS.list },
  });
  const rows = asData<CenterRow[]>(req.result?.data) ?? [];
  const options = rows
    .filter((c) => !exclude?.(c.id))
    .map((c) => ({ value: c.id, label: c.name }));
  if (picked && picked.value === value && !options.some((o) => o.value === value)) {
    options.unshift(picked);
  }
  return (
    <Combobox
      id={id}
      options={options}
      value={value}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      search={search}
      onSearchChange={setSearch}
      onChange={(v) => {
        const o = options.find((x) => x.value === v);
        setPicked(o ?? null);
        onChange(v, o?.label);
      }}
    />
  );
}
