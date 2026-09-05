import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseOrThrow } from "@repo/server-core/validation/zod";
import { toErrorResponse } from "@repo/server-core/errors/http";
import { localizeApiError } from "@repo/ui/lib/api-error";

/**
 * M-7 is a chain, and every link already existed except the last: zod names the
 * field, ValidationError carries the map, the envelope lifts it to
 * `error.fields`, `localizeApiError` puts it on the error, and the form pins it
 * to the input. A break anywhere is silent — the operator just sees a generic
 * toast — so the whole chain is exercised here rather than one link at a time.
 */
async function roundTrip(schema: z.ZodTypeAny, body: unknown) {
  let response: Response;
  try {
    parseOrThrow(schema, body);
    throw new Error("expected the schema to reject this body");
  } catch (err) {
    response = toErrorResponse(err) as unknown as Response;
  }
  const data = await response.json();
  // What ky hands the client: the parsed body on the error, plus the status.
  return localizeApiError({ response: { status: response.status }, data });
}

const schema = z.object({
  email: z.string().email("Invalid email address"),
  amount: z.number().min(1, "Amount must be at least 1"),
});

describe("M-7 a validation failure reaches the input that caused it", () => {
  it("carries a per-field map from zod all the way to the client error", async () => {
    const error = await roundTrip(schema, { email: "nope", amount: 0 });

    // ValidationError answers 400; `localizeApiError` buckets 400 and 422
    // alike as "validation", which is what the screens branch on.
    expect(error.statusCode).toBe(400);
    expect(error.apiErrorCode).toBe("validation");
    expect(error.fields).toEqual({
      email: ["Invalid email address"],
      amount: ["Amount must be at least 1"],
    });
  });

  it("keeps the field path for a nested schema, so the head names a real input", async () => {
    const nested = z.object({
      schedulePattern: z.object({ startDate: z.string().min(1, "Start date is required") }),
    });
    const error = await roundTrip(nested, { schedulePattern: { startDate: "" } });

    expect(error.fields).toEqual({
      "schedulePattern.startDate": ["Start date is required"],
    });
  });

  it("buckets a whole-body rejection under `_`, which the form shows as a root error", async () => {
    const error = await roundTrip(z.string(), 42);
    expect(Object.keys(error.fields ?? {})).toEqual(["_"]);
  });

  it("does not invent fields for an error that has none", async () => {
    const response = toErrorResponse(
      Object.assign(new Error("nope"), { code: "P2025" }),
    ) as unknown as Response;
    const error = localizeApiError({
      response: { status: response.status },
      data: await response.json(),
    });

    expect(error.statusCode).toBe(404);
    expect(error.fields).toBeUndefined();
  });
});
