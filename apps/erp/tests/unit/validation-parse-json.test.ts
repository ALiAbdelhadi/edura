import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson, parseOrThrow } from "@/lib/validation/zod";
import { ValidationError } from "@/lib/errors/classes";

// parseJson is the single body-parsing door for every mutating route (the
// convention suite forbids raw req.json()). These tests pin its two contracts:
// malformed JSON and schema failures both become a 400 ValidationError, with
// field errors keyed by dotted path.

const schema = z.object({
  name: z.string().min(1),
  nested: z.object({ n: z.number() }).optional(),
});

function jsonReq(body: string): Request {
  return new Request("http://t.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("parseJson", () => {
  it("returns the parsed, typed body on success", async () => {
    const data = await parseJson(jsonReq(JSON.stringify({ name: "x" })), schema);
    expect(data).toEqual({ name: "x" });
  });

  it("malformed JSON → ValidationError (400), not a 500", async () => {
    await expect(parseJson(jsonReq("{not json"), schema)).rejects.toMatchObject({
      status: 400,
      code: "validation_error",
      message: "Invalid JSON body",
    });
  });

  it("schema failure → ValidationError carrying a field map", async () => {
    const err = await parseJson(
      jsonReq(JSON.stringify({ name: "", nested: { n: "NaN" } })),
      schema,
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    const fields = (err as ValidationError).details as { fields: Record<string, string[]> };
    expect(Object.keys(fields.fields)).toEqual(
      expect.arrayContaining(["name", "nested.n"]),
    );
  });
});

describe("parseOrThrow", () => {
  it("root-level issues land under the '_' key", () => {
    const err = (() => {
      try {
        parseOrThrow(z.string(), 42);
        return null;
      } catch (e) {
        return e as ValidationError;
      }
    })();
    expect(err).toBeInstanceOf(ValidationError);
    const fields = (err!.details as { fields: Record<string, string[]> }).fields;
    expect(Object.keys(fields)).toEqual(["_"]);
  });
});
