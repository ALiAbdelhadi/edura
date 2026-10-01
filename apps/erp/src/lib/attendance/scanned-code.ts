import { resolveStudentCode } from "@repo/shared/student-code";

export function codeFromScan(raw: string): string | null {
  const text = raw?.trim();
  if (!text) return null;

  const direct = resolveStudentCode(text);
  if (direct) return direct;

  const withoutQuery = (text.split(/[?#]/)[0] ?? "").trim();
  const last = withoutQuery.split("/").filter(Boolean).pop();
  if (!last) return null;

  const head = last.split("-")[0];
  return head ? resolveStudentCode(head) : null;
}
