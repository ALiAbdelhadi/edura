"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@repo/ui/components/input";
import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
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
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {searchField && (
        <div className="relative w-full sm:w-60">
          <Search className="pointer-events-none absolute inset-inline-start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchField.placeholder || t("shared.filterSearchPlaceholder")}
            value={currentValues[searchField.key]}
            onChange={(e) => updateParams(searchField.key, e.target.value)}
            className="ps-9 pe-9"
          />
          {currentValues[searchField.key] && (
            <button
              type="button"
              aria-label={t("shared.filterClearAll")}
              onClick={() => updateParams(searchField.key, "")}
              className="absolute inset-inline-end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
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
