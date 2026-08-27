import { BusinessRuleError } from "../../errors/classes";

export function normalizeEgyptPhone(input: string): string {
  const digits = input.replace(/[\s\-()]/g, "").replace(/^\+/, "").replace(/^00/, "");
  let national: string;
  if (digits.startsWith("20")) national = digits.slice(2);
  else national = digits;
  if (national.startsWith("0")) national = national.slice(1);
  if (!/^1[0125]\d{8}$/.test(national)) {
    throw new BusinessRuleError("Invalid Egyptian mobile number");
  }
  return `+20${national}`;
}
