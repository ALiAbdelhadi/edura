import { describe, expect, it } from "vitest";
import {
  handleProblem,
  isValidHandle,
  normalizeHandle,
  suggestHandle,
  RESERVED_HANDLES,
} from "@/lib/services/public-handles/handle-rules";
import { handleFromHost, publicProfileUrl, publicRootDomain } from "@/lib/public-site/host";

describe("handle rules — one namespace, one shape", () => {
  it("accepts a plain DNS label", () => {
    expect(handleProblem("elmaged")).toBeNull();
    expect(handleProblem("ahmed-elshennawy")).toBeNull();
    expect(handleProblem("a1b")).toBeNull();
  });

  it("normalizes case and whitespace before judging", () => {
    expect(normalizeHandle("  ElMaged ")).toBe("elmaged");
    expect(handleProblem("  ElMaged ")).toBeNull();
  });

  it("refuses what cannot be a hostname label", () => {
    expect(handleProblem("")).toBe("empty");
    expect(handleProblem("ab")).toBe("too_short");
    expect(handleProblem("a".repeat(41))).toBe("too_long");
    expect(handleProblem("-abc")).toBe("shape");
    expect(handleProblem("abc-")).toBe("shape");
    expect(handleProblem("a--b")).toBe("shape");
    expect(handleProblem("a.b")).toBe("shape");
    expect(handleProblem("a_b")).toBe("shape");
    expect(handleProblem("مركز")).toBe("shape");
    expect(handleProblem("a b")).toBe("shape");
  });

  it("refuses every reserved platform name, for a centre and a teacher alike", () => {
    for (const r of ["www", "api", "admin", "superadmin", "app", "erp", "login", "edura"]) {
      expect(RESERVED_HANDLES.has(r)).toBe(true);
      expect(handleProblem(r)).toBe("reserved");
    }
    expect(isValidHandle("WWW")).toBe(false);
  });

  it("suggests from a Latin name and stays silent on an Arabic one", () => {
    expect(suggestHandle("El Maged Center")).toBe("el-maged-center");
    expect(suggestHandle("  Ahmed   El-Shennawy!! ")).toBe("ahmed-el-shennawy");
    expect(suggestHandle("مركز الماجد")).toBe("");
    expect(suggestHandle("ab")).toBe("");
    expect(suggestHandle("www")).toBe("");
  });
});

describe("tenant host resolution — dormant without a root domain", () => {
  it("is off when PUBLIC_ROOT_DOMAIN is unset or blank", () => {
    expect(publicRootDomain({})).toBeNull();
    expect(publicRootDomain({ PUBLIC_ROOT_DOMAIN: "  " })).toBeNull();
    expect(handleFromHost("elmaged.edura.com", null)).toBeNull();
  });

  it("trims dots and case from the configured root", () => {
    expect(publicRootDomain({ PUBLIC_ROOT_DOMAIN: ".Edura.COM." })).toBe(
      "edura.com",
    );
  });

  it("resolves exactly one label under the root", () => {
    expect(handleFromHost("elmaged.edura.com", "edura.com")).toBe("elmaged");
    expect(handleFromHost("ElMaged.Edura.com:443", "edura.com")).toBe("elmaged");
  });

  it("never resolves the root, a reserved label, two labels, a port-only host, or a lookalike", () => {
    expect(handleFromHost("edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("www.edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("api.edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("a.b.edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("evil-edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("edura.com.evil.io", "edura.com")).toBeNull();
    expect(handleFromHost("[::1]:3000", "edura.com")).toBeNull();
    expect(handleFromHost("", "edura.com")).toBeNull();
    expect(handleFromHost(null, "edura.com")).toBeNull();
  });

  it("refuses a label that the database CHECK would refuse", () => {
    expect(handleFromHost("-x.edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("a--b.edura.com", "edura.com")).toBeNull();
    expect(handleFromHost("ab.edura.com", "edura.com")).toBeNull();
  });
});

describe("the public URL — subdomain when there is a root, path otherwise", () => {
  it("path form is canonical until DNS exists", () => {
    expect(
      publicProfileUrl({ baseUrl: "https://edura-erp.vercel.app/", locale: "ar", handle: "elmaged" }),
    ).toBe("https://edura-erp.vercel.app/ar/p/elmaged");
  });
  it("subdomain form once the root is configured", () => {
    expect(
      publicProfileUrl({
        baseUrl: "https://edura.com",
        locale: "ar",
        handle: "elmaged",
        rootDomain: "edura.com",
      }),
    ).toBe("https://elmaged.edura.com");
  });
});
