import { describe, it, expect } from "vitest";
import {
  PAGE_LIMIT_MAX,
  parsePageLimit,
} from "@repo/server-core/validation/common";

describe("M-12 parsePageLimit — the one pagination parser", () => {
  it("falls back to the per-call-site default when page/limit are absent", () => {
    expect(parsePageLimit({}, 25)).toEqual({
      page: 1,
      limit: 25,
      skip: 0,
      take: 25,
    });
  });

  it("parses the string query-param form the routes actually receive", () => {
    expect(parsePageLimit({ page: "3", limit: "10" }, 20)).toEqual({
      page: 3,
      limit: 10,
      skip: 20,
      take: 10,
    });
  });

  it("parses the numeric form used by the internal service callers", () => {
    expect(parsePageLimit({ page: 2, limit: 50 }, 20).skip).toBe(50);
  });

  it("clamps every caller to ONE cap, including the sites that used 200/500", () => {
    expect(parsePageLimit({ limit: "200" }, 50).limit).toBe(PAGE_LIMIT_MAX);
    expect(parsePageLimit({ limit: 500 }, 100).limit).toBe(PAGE_LIMIT_MAX);
    expect(PAGE_LIMIT_MAX).toBe(100);
  });

  it("never returns a page below 1 or a negative skip", () => {
    expect(parsePageLimit({ page: "-4" }, 20).page).toBe(1);
    expect(parsePageLimit({ page: "0" }, 20).skip).toBe(0);
  });

  it("treats garbage as absent rather than as zero rows", () => {
    expect(parsePageLimit({ page: "abc", limit: "abc" }, 20)).toEqual({
      page: 1,
      limit: 20,
      skip: 0,
      take: 20,
    });
    expect(parsePageLimit({ limit: "0" }, 20).limit).toBe(20);
  });

  it("truncates fractional input instead of handing Prisma a float", () => {
    expect(parsePageLimit({ page: 2.7, limit: 10.9 }, 20)).toEqual({
      page: 2,
      limit: 10,
      skip: 10,
      take: 10,
    });
  });
});
