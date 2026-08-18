"use client";

import React from "react";
import { useSearchParams, useParams } from "next/navigation";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import type { RouterProvider, GoConfig, ParseFunction } from "@refinedev/core";

function stringifyQuery(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v) => params.append(key, String(v)));
    } else {
      params.set(key, String(value));
    }
  });
  return params.toString();
}

function buildUrl(to: string, query?: Record<string, unknown>): string {
  let url = to;
  const queryString = query ? stringifyQuery(query) : "";

  if (queryString) {
    const separator = url.includes("?") ? "&" : "?";
    url += separator + queryString;
  }

  return url;
}

const RefineLink = React.forwardRef<
  HTMLAnchorElement,
  React.PropsWithChildren<{ to: string; [prop: string]: any }>
>(function RefineLink({ to, children, ...props }, ref) {
  return React.createElement(Link, { href: to, ref, ...props }, children);
});

export function useAppRouterProvider(): RouterProvider {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();

  const go = React.useCallback(
    (config: GoConfig) => {
      const { to, query, type = "push", options } = config;

      let target = to || pathname || "";

      if (options?.keepQuery && searchParams) {
        const kept = new URLSearchParams(searchParams.toString());
        if (query) {
          Object.entries(query).forEach(([k, v]) => {
            if (v === undefined || v === null) {
              kept.delete(k);
            } else {
              kept.set(k, String(v));
            }
          });
        }
        const qs = kept.toString();
        if (qs) target += (target.includes("?") ? "&" : "?") + qs;
      } else if (query) {
        target = buildUrl(target, query);
      }

      if (type === "replace") {
        router.replace(target);
      } else if (type === "path") {
        return target;
      } else {
        router.push(target);
      }
      return target;
    },
    [router, pathname, searchParams],
  );

  const back = React.useCallback(() => {
    router.back();
  }, [router]);

  const parse: ParseFunction = React.useCallback(() => {
    const filters: any[] = [];
    const sorters: any[] = [];
    const currentPage = searchParams?.get("page")
      ? Number(searchParams.get("page"))
      : undefined;
    const pageSize = searchParams?.get("pageSize")
      ? Number(searchParams.get("pageSize"))
      : undefined;

    searchParams?.forEach((value, key) => {
      if (["page", "pageSize", "sort"].includes(key)) return;
      filters.push({ field: key, operator: "eq", value });
    });

    const sort = searchParams?.get("sort");
    if (sort) {
      const [field, order] = sort.split(":");
      if (field && order) {
        sorters.push({ field, order: order === "desc" ? "desc" : "asc" });
      }
    }

    let resource: string | undefined;
    let action: "list" | "create" | "edit" | "show" | "clone" | undefined;
    let id: string | undefined;

    if (pathname) {
      const segments = pathname.split("/").filter(Boolean);
      const dashIdx = segments.indexOf("dashboard");
      if (dashIdx >= 0 && segments.length > dashIdx + 2) {
        resource = segments[dashIdx + 2];
        const last = segments[segments.length - 1];
        const secondLast = segments[segments.length - 2];

        if (last === "create") {
          action = "create";
        } else if (last === "edit") {
          action = "edit";
          id = secondLast;
        } else if (last === "clone") {
          action = "clone";
          id = secondLast;
        } else if (resource && segments.length > dashIdx + 3) {
          action = "show";
          id = last;
        } else {
          action = "list";
        }
      }
    }

    return {
      params: {
        ...(params || {}),
        filters,
        sorters,
        currentPage,
        pageSize,
      },
      resource: resource ? { name: resource, route: resource } : undefined,
      id,
      action,
      pathname: pathname || undefined,
    };
  }, [pathname, searchParams, params]);

  return {
    go: () => go,
    back: () => back,
    parse: () => parse,
    Link: RefineLink,
  };
}
