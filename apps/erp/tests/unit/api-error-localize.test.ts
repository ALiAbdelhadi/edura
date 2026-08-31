import { describe, expect, it } from "vitest";
import {
  apiErrorMessage,
  classifyApiError,
  localizeApiError,
} from "@repo/ui/lib/api-error";

function httpError(
  status: number,
  envelope?: { code?: string; message?: string; fields?: Record<string, string[]> },
): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    name: "HTTPError",
    response: { status },
    data: envelope ? { error: envelope } : undefined,
  });
}

describe("classifyApiError", () => {
  it("classifies a fetch TypeError as offline with status 0", () => {
    const result = classifyApiError(new TypeError("Failed to fetch"));
    expect(result).toMatchObject({ code: "offline", statusCode: 0 });
  });

  it("classifies ky TimeoutError as timeout", () => {
    const err = Object.assign(new Error("Request timed out"), {
      name: "TimeoutError",
    });
    expect(classifyApiError(err).code).toBe("timeout");
  });

  it("maps envelope codes over raw status", () => {
    expect(classifyApiError(httpError(400, { code: "rate_limited" })).code).toBe(
      "rate_limited",
    );
    expect(classifyApiError(httpError(500, { code: "internal" })).code).toBe("server");
    expect(classifyApiError(httpError(409, { code: "conflict" })).code).toBe("conflict");
  });

  it("treats unknown 4xx envelope codes as business errors and keeps the message", () => {
    const result = classifyApiError(
      httpError(400, { code: "needs_payment", message: "Student has no coverage" }),
    );
    expect(result.code).toBe("business");
    expect(result.serverMessage).toBe("Student has no coverage");
  });

  it("falls back to status mapping without an envelope", () => {
    expect(classifyApiError(httpError(401)).code).toBe("unauthenticated");
    expect(classifyApiError(httpError(403)).code).toBe("forbidden");
    expect(classifyApiError(httpError(502)).code).toBe("server");
  });

  it("preserves validation fields from the envelope", () => {
    const result = classifyApiError(
      httpError(400, {
        code: "validation_error",
        message: "Validation failed",
        fields: { email: ["invalid"] },
      }),
    );
    expect(result.code).toBe("validation");
    expect(result.fields).toEqual({ email: ["invalid"] });
  });
});

describe("localizeApiError", () => {
  it("replaces browser runtime text with a localized message", () => {
    const err = localizeApiError(new TypeError("Failed to fetch"), "ar");
    expect(err.message).not.toMatch(/failed to fetch/i);
    expect(err.message).toBe(apiErrorMessage("offline", "ar"));
    expect(err.apiErrorCode).toBe("offline");
    expect(err.statusCode).toBe(0);
  });

  it("never shows the kernel's fixed 'Internal error' string", () => {
    const err = localizeApiError(
      httpError(500, { code: "internal", message: "Internal error" }),
      "ar",
    );
    expect(err.message).toBe(apiErrorMessage("server", "ar"));
    expect(err.message).not.toBe("Internal error");
    expect(err.serverMessage).toBe("Internal error");
  });

  it("keeps business-rule text verbatim so screens can act on it", () => {
    const err = localizeApiError(
      httpError(400, { code: "session_closed", message: "Session is cancelled" }),
      "ar",
    );
    expect(err.apiErrorCode).toBe("business");
    expect(err.message).toBe("Session is cancelled");
  });

  it("localizes to English when asked", () => {
    const err = localizeApiError(httpError(429, { code: "rate_limited" }), "en");
    expect(err.message).toBe(apiErrorMessage("rate_limited", "en"));
    expect(err.message).toMatch(/too many attempts/i);
  });

  it("is idempotent — a second pass does not rewrite the message", () => {
    const first = localizeApiError(httpError(500, { code: "internal" }), "ar");
    const again = localizeApiError(first, "en");
    expect(again).toBe(first);
    expect(again.message).toBe(apiErrorMessage("server", "ar"));
  });

  it("wraps non-Error inputs instead of throwing", () => {
    const err = localizeApiError("boom", "en");
    expect(err.apiErrorCode).toBe("unknown");
    expect(err.message).toBe(apiErrorMessage("unknown", "en"));
  });

  it("prefers the server's Arabic rendering for business errors in ar", () => {
    const raw = Object.assign(new Error("Request failed with status code 400"), {
      name: "HTTPError",
      response: { status: 400 },
      data: {
        error: {
          code: "business_rule",
          message: "Session is cancelled",
          messageAr: "الحصة ملغاة",
        },
      },
    });
    const err = localizeApiError(raw, "ar");
    expect(err.message).toBe("الحصة ملغاة");
    expect(err.serverMessage).toBe("Session is cancelled");
  });

  it("keeps English business text in en even when messageAr is present", () => {
    const raw = Object.assign(new Error("Request failed with status code 400"), {
      name: "HTTPError",
      response: { status: 400 },
      data: {
        error: {
          code: "business_rule",
          message: "Session is cancelled",
          messageAr: "الحصة ملغاة",
        },
      },
    });
    const err = localizeApiError(raw, "en");
    expect(err.message).toBe("Session is cancelled");
  });

  it("uses a specific Arabic rendering over the generic bucket for mapped codes", () => {
    const raw = Object.assign(new Error("Request failed with status code 409"), {
      name: "HTTPError",
      response: { status: 409 },
      data: {
        error: {
          code: "conflict",
          message: "You already have an open shift — close it before opening another",
          messageAr: "لديك وردية مفتوحة بالفعل — أغلقها قبل فتح وردية أخرى",
        },
      },
    });
    const err = localizeApiError(raw, "ar");
    expect(err.message).toBe("لديك وردية مفتوحة بالفعل — أغلقها قبل فتح وردية أخرى");
    expect(err.apiErrorCode).toBe("conflict");
  });
});
