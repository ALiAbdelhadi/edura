import { describe, expect, it } from "vitest";
import {
  DEFAULT_TITLE,
  DEFAULT_URL,
  notificationSpec,
  parsePushPayload,
  resolveClickTarget,
} from "@/lib/pwa/sw-handlers";

const ORIGIN = "https://app.edura.eg";

const data = (value: unknown, text = "") => ({
  json: () => {
    if (typeof value === "symbol") throw new SyntaxError("not json");
    return value;
  },
  text: () => text,
});

describe("parsePushPayload", () => {
  it("reads a well-formed payload", () => {
    expect(
      parsePushPayload(
        data({ title: "حصة ملغاة", body: "درس الأحد", url: "/ar/dashboard/student/schedule" }),
      ),
    ).toEqual({
      title: "حصة ملغاة",
      body: "درس الأحد",
      url: "/ar/dashboard/student/schedule",
    });
  });

  it("falls back to the raw text when the body is not JSON", () => {
    expect(parsePushPayload(data(Symbol("boom") as unknown, "plain text"))).toEqual({
      body: "plain text",
    });
  });

  it("never throws on a hostile or empty body", () => {
    expect(parsePushPayload(null)).toEqual({});
    expect(parsePushPayload(undefined)).toEqual({});
    expect(parsePushPayload(data(Symbol("boom") as unknown, ""))).toEqual({});
    expect(
      parsePushPayload({
        json: () => {
          throw new Error("x");
        },
        text: () => {
          throw new Error("y");
        },
      }),
    ).toEqual({});
    expect(parsePushPayload(data([1, 2, 3]))).toEqual({ body: "1,2,3" });
  });
});

describe("notificationSpec", () => {
  it("carries the URL onto the notification, where the click can reach it", () => {
    const spec = notificationSpec({
      title: "t",
      body: "b",
      url: "/ar/dashboard/parent/progress",
    });
    expect(spec.options.data.url).toBe("/ar/dashboard/parent/progress");
  });

  it("accepts a URL delivered inside data (the FCM shape)", () => {
    const spec = notificationSpec({ data: { url: "/en/dashboard/teacher/notes" } });
    expect(spec.options.data.url).toBe("/en/dashboard/teacher/notes");
  });

  it("falls back to a title and the app root rather than rendering nothing", () => {
    const spec = notificationSpec({});
    expect(spec.title).toBe(DEFAULT_TITLE);
    expect(spec.options.data.url).toBe(DEFAULT_URL);
  });
});

describe("resolveClickTarget", () => {
  const url = "/ar/dashboard/student/attendance";

  it("opens a window when nothing is open", () => {
    expect(resolveClickTarget(url, [], ORIGIN)).toEqual({ action: "open", url });
  });

  it("NAVIGATES an open tab instead of merely focusing it", () => {
    const clients = [{ url: `${ORIGIN}/ar/dashboard/student/wallet` }];
    expect(resolveClickTarget(url, clients, ORIGIN)).toEqual({
      action: "navigate",
      index: 0,
      url,
    });
  });

  it("focuses — never reloads — a tab already on the page", () => {
    const clients = [
      { url: `${ORIGIN}/ar/dashboard/student/wallet` },
      { url: `${ORIGIN}${url}` },
    ];
    expect(resolveClickTarget(url, clients, ORIGIN)).toEqual({
      action: "focus",
      index: 1,
      url,
    });
  });

  it("treats a query string as the same page", () => {
    const clients = [{ url: `${ORIGIN}${url}?tab=late#row-3` }];
    expect(resolveClickTarget(url, clients, ORIGIN).action).toBe("focus");
  });

  it("ignores a foreign-origin client", () => {
    const clients = [{ url: "https://evil.example/ar/dashboard/student/attendance" }];
    expect(resolveClickTarget(url, clients, ORIGIN)).toEqual({
      action: "open",
      url,
    });
  });

  it("survives an unparseable client URL", () => {
    const clients = [{ url: "not a url" }, { url: `${ORIGIN}/ar` }];
    expect(resolveClickTarget(url, clients, ORIGIN)).toEqual({
      action: "navigate",
      index: 1,
      url,
    });
  });
});
