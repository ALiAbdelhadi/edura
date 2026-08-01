// =============================================================================
// @repo/notifications — the transactional notification layer.
//
//   send("payment_receipt", { email, locale }, { receiptNumber, ... })
//
// EMAIL is the only channel shipped today. See channels/registry.ts for exactly
// what adding WhatsApp costs (one file, one array entry, one env value).
//
// Transport is @repo/server-core/mail/send — provider-agnostic SMTP. "Use
// Resend" is an env change (MAIL_PROVIDER=smtp, SMTP_HOST=smtp.resend.com), not
// a code change; no vendor SDK is imported anywhere in this package.
// =============================================================================

export { send, sendInBackground, type SendOptions } from "./send";
export { renderEmail } from "./render";
export { registerChannel, allChannels, getChannel } from "./channels/registry";
export { emailChannel, enabledChannelIds } from "./channels/email";
export { TEMPLATES, TEMPLATE_IDS, getTemplate } from "./templates/registry";
export { isPreviewMode } from "./preview";
export {
  normalizeLocale,
  formatEgp,
  formatDateTime,
  isRtl,
  type Locale,
} from "./locale";
export { groupFamilyCode } from "./templates/welcome";

export type {
  ChannelId,
  ChannelResult,
  DeliveryStatus,
  EmailVerificationData,
  NotificationChannel,
  NotificationResult,
  PasswordResetData,
  PaymentReceiptData,
  Recipient,
  RenderedEmail,
  RenderedWhatsApp,
  TemplateData,
  TemplateDataMap,
  TemplateId,
  WelcomeData,
} from "./types";
