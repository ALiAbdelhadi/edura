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
