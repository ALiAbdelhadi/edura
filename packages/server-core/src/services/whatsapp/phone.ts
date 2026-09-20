import { BusinessRuleError } from "../../errors/classes";

// Arabic-Indic (٠-٩) and Extended Arabic-Indic / Persian (۰-۹) digits, which an
// Arabic keyboard or an Arabic-locale Excel writes, mapped to ASCII.
export function toLatinDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

export function normalizeEgyptPhone(input: string): string {
  const digits = toLatinDigits(input)
    .replace(/[\s\-().‎‏]/g, "")
    .replace(/^\+/, "")
    .replace(/^00/, "");
  let national: string;
  if (digits.startsWith("20")) national = digits.slice(2);
  else national = digits;
  if (national.startsWith("0")) national = national.slice(1);
  if (!/^1[0125]\d{8}$/.test(national)) {
    throw new BusinessRuleError("Invalid Egyptian mobile number");
  }
  return `+20${national}`;
}

// Both spellings the platform has stored for one Egyptian mobile: the walk-in
// counter writes +201XXXXXXXXX, self-registration keeps 01XXXXXXXXX. A lookup
// by phone must try both or the same child is found under one and missed under
// the other. Returns [] for anything that is not a valid Egyptian mobile.
export function egyptPhoneVariants(input: string): string[] {
  try {
    const e164 = normalizeEgyptPhone(input);
    return [e164, `0${e164.slice(3)}`];
  } catch {
    return [];
  }
}
