import type { ZodSchema, ZodError } from "zod";
import { ValidationError } from "../errors/classes";

function fieldMap(err: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= [];
    fields[key].push(issue.message);
  }
  return fields;
}

export function parseOrThrow<T>(schema: ZodSchema<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError("Validation failed", fieldMap(result.error));
  }
  return result.data;
}

export async function parseJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  return parseOrThrow(schema, raw);
}

/**
 * `parseJson` for a route whose body is entirely optional.
 *
 * An ABSENT body parses as `{}` and still goes through the schema; a body that
 * is present but malformed or invalid throws, exactly as `parseJson` does.
 * That distinction is the point: the `parseJson(...).catch(() => ({}))` this
 * replaces treated "no body" and "a field the caller got wrong" as the same
 * thing, so a bad value was silently dropped and the request proceeded on the
 * default as though the caller had never sent it.
 */
export async function parseOptionalJson<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  if (text.trim() === "") return parseOrThrow(schema, {});
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  return parseOrThrow(schema, raw);
}
