"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Input, Select, Button, Space } from "antd";
import { SearchOutlined, ClearOutlined } from "@ant-design/icons";
import { useI18n } from "@/components/providers/I18nProvider";

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

export default function FilterBar({ searchField, facets = [], onFilterChange }: FilterBarProps) {
  const { t } = useI18n();
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
    <Space wrap style={{ marginBottom: 16 }}>
      {searchField && (
        <Input
          prefix={<SearchOutlined />}
          placeholder={searchField.placeholder || t("shared.filterSearchPlaceholder")}
          value={currentValues[searchField.key]}
          onChange={(e) => updateParams(searchField.key, e.target.value)}
          allowClear
          style={{ width: 240 }}
        />
      )}
      {facets.map((facet) => (
        <Select
          key={facet.key}
          placeholder={facet.placeholder || facet.key}
          value={currentValues[facet.key] || undefined}
          onChange={(val) => updateParams(facet.key, val || "")}
          options={facet.options}
          allowClear={facet.allowClear !== false}
          style={{ minWidth: 160 }}
        />
      ))}
      {hasFilters && (
        <Button icon={<ClearOutlined />} onClick={clearAll}>
          {t("shared.filterClearAll")}
        </Button>
      )}
    </Space>
  );
}
