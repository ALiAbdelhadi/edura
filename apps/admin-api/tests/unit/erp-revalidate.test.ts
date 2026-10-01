import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deferred = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("@repo/server-core/http/after", () => ({ runAfter: (fn: () => unknown) => void deferred.push(fn) }));
vi.mock("@repo/server-core/backoffice/erp-base-url", () => ({ erpBaseUrl: () => "http://erp.test" }));

import { onAdminAudit, writeAdminAudit } from "@repo/server-core/audit/admin-audit";
import { registerErpRevalidation } from "../../src/erp-revalidate";

const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));
const create = vi.fn(async () => ({}));
const tx = { auditLog: { create } } as never;
const actor = { id: "sa-1" };

async function runDeferred() {
  while (deferred.length) await deferred.shift()!();
}

describe("back-office audit -> ERP cache invalidation", () => {
  beforeEach(() => {
    deferred.length = 0;
    fetchMock.mockClear();
    create.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("INTERNAL_API_SECRET", "shared-secret");
    registerErpRevalidation();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("posts nothing while the write is still in progress — only runAfter()", async () => {
    await writeAdminAudit(tx, actor, { action: "update", targetType: "course", targetId: "c1" });
    expect(fetchMock).not.toHaveBeenCalled();
    await runDeferred();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the datasets the write changed, with the secret, to the ERP", async () => {
    await writeAdminAudit(tx, actor, { action: "update", targetType: "subject", targetId: "s1" });
    await runDeferred();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://erp.test/api/v1/internal/revalidate");
    expect((init.headers as Record<string, string>)["x-internal-secret"]).toBe("shared-secret");
    expect(JSON.parse(init.body as string)).toEqual({ datasets: ["catalog", "discovery"] });
  });

  it("coalesces a bulk action into ONE post", async () => {
    await writeAdminAudit(tx, actor, { action: "a", targetType: "course", targetId: "1" });
    await writeAdminAudit(tx, actor, { action: "b", targetType: "center", targetId: "2" });
    await writeAdminAudit(tx, actor, { action: "c", targetType: "subject", targetId: "3" });
    await runDeferred();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(new Set(body.datasets)).toEqual(new Set(["discovery", "publicProfile", "catalog"]));
  });

  it("stays silent for writes that change no public data — money, attendance, the rest", async () => {
    for (const t of ["payment", "payout", "session", "enrollment", "invoice"]) {
      await writeAdminAudit(tx, actor, { action: "x", targetType: t, targetId: "1" });
    }
    await runDeferred();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing without INTERNAL_API_SECRET, and never throws", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await writeAdminAudit(tx, actor, { action: "x", targetType: "course", targetId: "1" });
    await runDeferred();
    expect(fetchMock).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("an unreachable ERP never fails the admin's write", async () => {
    fetchMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      writeAdminAudit(tx, actor, { action: "x", targetType: "course", targetId: "1" }),
    ).resolves.toBeUndefined();
    await expect(runDeferred()).resolves.toBeUndefined();
    err.mockRestore();
  });

  it("a throwing listener never fails the audited write", async () => {
    const off = onAdminAudit(() => {
      throw new Error("listener bug");
    });
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      writeAdminAudit(tx, actor, { action: "x", targetType: "payment", targetId: "1" }),
    ).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);
    off();
    err.mockRestore();
  });
});
