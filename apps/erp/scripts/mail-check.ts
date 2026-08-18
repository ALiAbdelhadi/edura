/**
 * Mail configuration check.
 *
 *   bun run --filter edura mail:check                    # verify SMTP credentials only
 *   bun run --filter edura mail:check you@gmail.com      # send a test email (Arabic)
 *   bun run --filter edura mail:check you@gmail.com en   # ... in English
 *   bun run --filter edura mail:check you@gmail.com both # one of each, to compare
 *
 * Proves the SMTP host, port and credentials work BEFORE trusting a deploy —
 * the alternative is discovering a bad password only when a user can't reset
 * their password.
 */
import { mailProvider, sendMail, verifyMailConnection } from "@repo/server-core/mail/send";
import { passwordResetEmail } from "@repo/server-core/mail/templates";
// Same origin resolver the real service uses, so the preview link is exactly
// what a user would receive — a hardcoded one here would hide a misconfigured
// APP_BASE_URL instead of surfacing it.
import { appBaseUrl } from "@repo/server-core/http/app-url";

async function main() {
  const to = process.argv[2];

  console.log(`MAIL_PROVIDER = ${mailProvider()}`);
  console.log(`MAIL_FROM     = ${process.env.MAIL_FROM ?? "(unset)"}`);
  console.log(`SMTP_HOST     = ${process.env.SMTP_HOST || "(unset)"}`);
  console.log(`SMTP_PORT     = ${process.env.SMTP_PORT ?? "587 (default)"}`);
  console.log(`SMTP_USER     = ${process.env.SMTP_USER || "(unset)"}`);
  console.log(`SMTP_PASS     = ${process.env.SMTP_PASS ? "(set)" : "(unset)"}`);
  console.log(`APP_BASE_URL  = ${appBaseUrl()}   (reset links point here)`);
  console.log("");

  if (mailProvider() === "console") {
    console.log("⚠️  Provider is 'console' — emails are logged, never delivered.");
    console.log("   Set MAIL_PROVIDER=smtp plus SMTP_* in apps/www/.env.local.");
    process.exit(1);
  }

  console.log("Verifying SMTP connection…");
  const verified = await verifyMailConnection();
  if (!verified.sent) {
    console.error(`❌ SMTP verification failed: ${verified.error}`);
    process.exit(1);
  }
  console.log("✅ SMTP connection + authentication OK");

  if (!to) {
    console.log("\nPass an address to send a real test email:");
    console.log("   bun run --filter edura mail:check you@example.com");
    process.exit(0);
  }

  const arg = (process.argv[3] ?? "ar").toLowerCase();
  const locales: ("ar" | "en")[] =
    arg === "both" ? ["ar", "en"] : arg === "en" ? ["en"] : ["ar"];

  for (const locale of locales) {
    console.log(`\nSending a test password-reset email (${locale}) to ${to}…`);
    const { subject, html, text } = await passwordResetEmail({
      // The token is deliberately not a real one — this previews the design,
      // it must never hand out a usable credential.
      link: `${appBaseUrl()}/${locale}/reset-password?token=TEST-TOKEN-NOT-REAL`,
      locale,
    });
    const result = await sendMail({ to, subject, html, text });

    if (!result.sent) {
      console.error(`❌ Send failed: ${result.error}`);
      process.exit(1);
    }
    console.log(`✅ Sent. messageId = ${result.messageId}`);
  }
  console.log("   Check the inbox — and the spam folder.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
