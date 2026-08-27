"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

export function useParamSeed(
  param: string,
  apply: (value: string) => void,
): void {
  const searchParams = useSearchParams();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    const value = searchParams.get(param);
    if (!value) return;
    done.current = true;
    apply(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, param]);
}
