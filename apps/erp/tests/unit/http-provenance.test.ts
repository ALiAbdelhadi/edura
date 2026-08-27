import { describe, expect, it } from "vitest";
import { parseProvenance } from "@/lib/http/provenance";

const url = (qs: string) => new URL(`http://t.local/api/v1/reports/x${qs}`);

describe("parseProvenance", () => {
  it("no params → undefined (unfiltered fast path)", () => {
    expect(parseProvenance(url(""))).toBeUndefined();
  });

  it("unknown values → undefined, never an error", () => {
    expect(parseProvenance(url("?systemStatus=bogus&dataSource=nope"))).toBeUndefined();
  });

  it("valid systemStatus narrows only that dimension", () => {
    expect(parseProvenance(url("?systemStatus=external"))).toEqual({
      systemStatus: "external",
      dataSource: null,
    });
  });

  it("valid dataSource narrows only that dimension", () => {
    expect(parseProvenance(url("?dataSource=manual"))).toEqual({
      systemStatus: null,
      dataSource: "manual",
    });
  });

  it("both dimensions together", () => {
    expect(parseProvenance(url("?systemStatus=enrolled&dataSource=system"))).toEqual({
      systemStatus: "enrolled",
      dataSource: "system",
    });
  });

  it("one valid + one unknown → the unknown falls back to combined", () => {
    expect(parseProvenance(url("?systemStatus=external&dataSource=bogus"))).toEqual({
      systemStatus: "external",
      dataSource: null,
    });
  });
});
