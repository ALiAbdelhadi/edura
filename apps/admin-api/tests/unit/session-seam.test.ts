import { describe, expect, it } from "vitest";
import { adminAuth } from "@repo/server-core/backoffice-auth/instance";
import { createApp } from "../../src/app";
import { auth } from "../../src/session-seam";

describe("session seam", () => {
  it("registers the service's back-office auth instance for the session reader", () => {
    createApp({ proxySecret: () => undefined, accessLog: false });
    expect(adminAuth()).toBe(auth);
  });

  it("builds the back-office plugin chain with serviceCookies() where nextCookies() sits in the Next app", () => {
    const ids = (auth.options.plugins ?? []).map((p) => p.id);
    expect(ids).not.toContain("next-cookies");
    expect(ids.slice(-3)).toEqual(["two-factor", "admin", "service-cookies"]);
  });
});
