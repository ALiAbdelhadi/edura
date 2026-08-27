export type Locale = "ar" | "en";

export type Recipient = {
  email?: string | null;
  phone?: string | null;
  locale?: string | null;
  userId?: string;
  centerId?: string;
};

export type ChannelId = "email" | "whatsapp";

export type DeliveryStatus =
  | "sent"
  | "skipped"
  | "no_recipient"
  | "failed";

export type ChannelResult = {
  channel: ChannelId;
  status: DeliveryStatus;
  messageId?: string;
  error?: string;
};

export type NotificationResult = {
  template: TemplateId;
  results: ChannelResult[];
  delivered: boolean;
};

export type WelcomeData = {
  name: string;
  link: string;
  studentCode?: string | null;
  expiryDays: number;
};

export type PasswordResetData = {
  link: string;
  expiryHours: number;
};

export type EmailVerificationData = {
  link: string;
  expiryHours: number;
};

export type PaymentReceiptData = {
  receiptNumber: string;
  amountPiasters: number;
  description: string;
  payeeName: string;
  method: "card" | "wallet" | "cash";
  paidAt: Date;
  link?: string | null;
};

export type WeeklyDigestData = {
  centerName: string;
  periodStart: string;
  periodEnd: string;
  revenuePiasters: number;
  expensesPiasters: number;
  netPiasters: number;
  attendanceRatePct: number;
  sessionsCount: number;
  gapsCount: number;
  link?: string | null;
};

export type GuardianVerificationData = {
  studentName: string;
  link: string;
  expiryDays: number;
};

export type TemplateDataMap = {
  welcome: WelcomeData;
  password_reset: PasswordResetData;
  email_verification: EmailVerificationData;
  payment_receipt: PaymentReceiptData;
  weekly_digest: WeeklyDigestData;
  guardian_verification: GuardianVerificationData;
};

export type TemplateId = keyof TemplateDataMap;

export type TemplateData<T extends TemplateId = TemplateId> = TemplateDataMap[T];

export interface NotificationChannel {
  readonly id: ChannelId;
  isEnabled(): boolean;
  supports(template: TemplateId): boolean;
  send<T extends TemplateId>(
    template: T,
    to: Recipient,
    data: TemplateData<T>,
  ): Promise<ChannelResult>;
}

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

export type RenderedWhatsApp = {
  template: string;
  params: string[];
};
