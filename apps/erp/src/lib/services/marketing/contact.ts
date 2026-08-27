import { platformDb } from "@/lib/db/scope";
import type { Locale } from "@repo/database";

export type ContactSubject = "demo" | "pricing" | "support" | "partnership" | "other";

export type ContactSubmissionInput = {
  name: string;
  email: string;
  phone?: string | null;
  subject: ContactSubject;
  message: string;
  locale: Locale;
  ip: string | null;
  userAgent: string | null;
};

function asInet(ip: string | null): string | null {
  if (!ip) return null;
  const v4 = /^(\d{1,3}\.){3}\d{1,3}$/;
  const v6 = /^[0-9a-fA-F:]+$/;
  if (v4.test(ip) && ip.split(".").every((o) => Number(o) <= 255)) return ip;
  if (ip.includes(":") && v6.test(ip)) return ip;
  return null;
}

export async function recordContactSubmission(input: ContactSubmissionInput): Promise<void> {
  await platformDb((tx) =>
    tx.contactSubmission.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone ?? null,
        subject: input.subject,
        message: input.message,
        locale: input.locale,
        source: "website_contact",
        ipAddress: asInet(input.ip),
        userAgent: input.userAgent,
      },
      select: { id: true },
    }),
  );

}
