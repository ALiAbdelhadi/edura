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
