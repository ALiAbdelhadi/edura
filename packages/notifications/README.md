# @repo/notifications

The transactional notification layer. One template registry, one channel
registry, one dispatcher.

```ts
import { send } from "@repo/notifications";

await send(
  "payment_receipt",
  { email: user.email, locale: user.locale, userId: user.id },
  { receiptNumber, amountPiasters, description, payeeName, method, paidAt },
);
```

`send` **never throws**. Every call site is downstream of something that already
committed (a registration, a password reset, settled money), so a delivery
failure is an operational fact to record — never a reason to fail the thing that
caused it. Callers that care read `result.delivered`.

## Templates

| id                   | Sent by                                                  |
| -------------------- | -------------------------------------------------------- |
| `welcome`            | `sendStudentWelcomeEmail` after a self-registration commits |
| `password_reset`     | `requestPasswordReset` (@repo/server-core)                |
| `email_verification` | better-auth `emailVerification.sendVerificationEmail`      |
| `payment_receipt`    | `sendPaymentReceiptEmail` — gateway webhook + wallet path  |

Each is Arabic **and** English, RTL/LTR, with a hand-written `text/plain` part
(a missing plain-text alternative is a strong spam signal, and auto-stripped
text reads like debris).

Preview them all in a browser without sending anything:

```bash
bun run --filter @repo/notifications preview
```

## Transport

`transport/smtp.ts` — provider-agnostic **nodemailer over SMTP**. No vendor SDK
is imported anywhere in this package, and that is deliberate (see CLAUDE.md):
paying past a vendor's free tier needs an international card, which is the real
constraint from Egypt.

Switching provider is therefore always an env change:

```bash
# Resend, via its SMTP bridge
MAIL_PROVIDER=smtp
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxx      # the Resend API key, used as the SMTP password
MAIL_FROM="Edura <no-reply@yourdomain.com>"
```

Any other host (Brevo, Zoho, Gmail app password, a self-hosted relay) is the
same five lines pointed elsewhere. `MAIL_PROVIDER=console` is the dev default
and **delivers nothing**.

## Adding the WhatsApp channel

The whole cost, once a Meta business number is verified:

1. Write `channels/whatsapp.ts` satisfying `NotificationChannel`. It delegates to
   the existing `@repo/server-core/services/whatsapp/send` abstraction, which
   already has both a mock driver and a Cloud API driver.
2. Add a `whatsapp:` renderer to the templates Meta has approved. A template with
   no `whatsapp` renderer reports `skipped`, so partial approval is fine.
3. Push it into `BUILT_IN` in `channels/registry.ts`.
4. Set `NOTIFICATION_CHANNELS=email,whatsapp`.

No dispatcher change, no template-type change, no call-site change.
`apps/www/tests/unit/notifications.test.ts` proves step 3 is sufficient by
registering a synthetic channel and asserting the fan-out reaches it.

## Env

| Variable                     | Default                  | Meaning                                              |
| ---------------------------- | ------------------------ | ---------------------------------------------------- |
| `NOTIFICATION_CHANNELS`      | `email`                  | Comma-separated live channels.                       |
| `NOTIFICATIONS_PREVIEW`      | unset                    | `1` = render to disk, never send. Ignored in prod.    |
| `NOTIFICATIONS_PREVIEW_DIR`  | `.notifications-preview` | Where previews are written.                          |
| `MAIL_PROVIDER`              | `console`                | `console` (logs only) or `smtp`.                     |
| `SMTP_HOST/PORT/USER/PASS`   | —                        | Required when `MAIL_PROVIDER=smtp`.                  |
| `SMTP_SECURE`                | port `465`               | Override implicit-TLS detection.                     |
| `MAIL_FROM`, `MAIL_REPLY_TO` | —                        | Envelope addresses.                                  |
