"use client";

import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { SearchInput } from "@repo/ui/components/search-input";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type SearchFieldConfig = {
  key: string;
  placeholder?: string;
};

export type SelectFacet = {
  key: string;
  placeholder?: string;
  options: { label: string; value: string }[];
  allowClear?: boolean;
};

export type FilterValues = Record<string, string>;

type FilterBarProps = {
  searchField?: SearchFieldConfig;
  facets?: SelectFacet[];
  onFilterChange?: (values: FilterValues) => void;
};

const CLEAR_VALUE = "__all__";

export default function FilterBar({ searchField, facets = [], onFilterChange }: FilterBarProps) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const currentValues = useMemo(() => {
    const values: FilterValues = {};
    if (searchField) {
      values[searchField.key] = searchParams.get(searchField.key) || "";
    }
    for (const f of facets) {
      values[f.key] = searchParams.get(f.key) || "";
    }
    return values;
  }, [searchParams, searchField, facets]);

  const updateParams = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
      const next = { ...currentValues, [key]: value };
      onFilterChange?.(next);
    },
    [searchParams, router, pathname, currentValues, onFilterChange],
  );

  const clearAll = useCallback(() => {
    router.replace(pathname, { scroll: false });
    const cleared: FilterValues = {};
    if (searchField) cleared[searchField.key] = "";
    for (const f of facets) cleared[f.key] = "";
    onFilterChange?.(cleared);
  }, [router, pathname, searchField, facets, onFilterChange]);

  const hasFilters = Object.values(currentValues).some(Boolean);

  return (
    /* No external margin on the root. It previously carried `mb-4`, and because its
       only consumer renders it inside <PageHeader actions> — a flex row with
       `items-center` — that 16px bottom margin was included in the centring, pushing
       the search field and the status filter ~8px ABOVE the button beside them. A
       component cannot know what it will sit next to, so spacing belongs to the layout
       that places it, never to the component itself. */
    <div className="flex flex-wrap items-center gap-2">
      {searchField && (
        <SearchInput
          className="w-full sm:w-60"
          placeholder={searchField.placeholder || t("shared.filterSearchPlaceholder")}
          value={currentValues[searchField.key] ?? ""}
          onValueChange={(v) => updateParams(searchField.key, v)}
          onClear={() => updateParams(searchField.key, "")}
          clearLabel={t("shared.filterClearAll")}
        />
      )}
      {facets.map((facet) => (
        <Select
          key={facet.key}
          value={currentValues[facet.key] || undefined}
          onValueChange={(val) => updateParams(facet.key, val === CLEAR_VALUE ? "" : val || "")}
        >
          <SelectTrigger className="min-w-40">
            <SelectValue placeholder={facet.placeholder || facet.key} />
          </SelectTrigger>
          <SelectContent>
            {facet.allowClear !== false && (
              <SelectItem value={CLEAR_VALUE}>
                {facet.placeholder || facet.key}
              </SelectItem>
            )}
            {facet.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {hasFilters && (
        <Button variant="outline" onClick={clearAll}>
          <X className="size-4" />
          {t("shared.filterClearAll")}
        </Button>
      )}
    </div>
  );
}
