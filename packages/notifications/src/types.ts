// =============================================================================
// The notification contract.
//
// Two registries, one dispatcher:
//   * TEMPLATES  — what to say (id -> per-channel renderers + subject copy)
//   * CHANNELS   — how to say it (id -> a driver implementing `send`)
//
// Adding a channel means writing one object that satisfies `NotificationChannel`
// and adding it to the channel registry. Nothing in the dispatcher, the
// templates, or any call site changes — that is the "WhatsApp plugs in with
// zero refactor" claim, and `tests/channel-pluggability.test.ts` proves it by
// registering a synthetic channel and asserting the dispatcher fans out to it.
// =============================================================================

export type Locale = "ar" | "en";

/**
 * Who we are writing to. Every field is optional except the identity ones a
 * given channel needs — a channel that has no usable address for a recipient
 * returns `no_recipient`, never `failed`. "We had nowhere to send it" and "we
 * tried and it broke" are different operational facts and page different
 * people.
 */
export type Recipient = {
  email?: string | null;
  /** E.164. Unused today; the WhatsApp channel is what will read it. */
  phone?: string | null;
  /** Falls back to Arabic — the platform's primary language. */
  locale?: string | null;
  /** Attribution only. NEVER rendered into a message body. */
  userId?: string;
  centerId?: string;
};

export type ChannelId = "email" | "whatsapp";

export type DeliveryStatus =
  /** Handed to the provider and accepted. */
  | "sent"
  /** The channel is off in this environment (env knob), so we chose not to. */
  | "skipped"
  /** No address of the kind this channel needs. */
  | "no_recipient"
  /** We tried and the provider rejected/errored. */
  | "failed";

export type ChannelResult = {
  channel: ChannelId;
  status: DeliveryStatus;
  /** Provider message id when the provider returns one. */
  messageId?: string;
  /** Never contains a token, password, or message body. */
  error?: string;
};

export type NotificationResult = {
  template: TemplateId;
  results: ChannelResult[];
  /** True when at least one channel reported `sent`. */
  delivered: boolean;
};

// -----------------------------------------------------------------------------
// Template payloads. One type per template; the dispatcher is generic over the
// id so `send("payment_receipt", to, { link })` fails to COMPILE.
// -----------------------------------------------------------------------------

export type WelcomeData = {
  name: string;
  /** Deep link into onboarding. Already carries whatever token the caller minted. */
  link: string;
  /** Student ID, shown so a parent can be given it. Optional — non-students have none. */
  studentCode?: string | null;
  expiryDays: number;
};

export type PasswordResetData = {
  link: string;
  /** Hours the link stays valid. */
  expiryHours: number;
};

export type EmailVerificationData = {
  link: string;
  expiryHours: number;
};

export type PaymentReceiptData = {
  /** Human receipt number from the ledger — NOT an internal row id. */
  receiptNumber: string;
  /** Piasters. Formatted by the template so every surface agrees. */
  amountPiasters: number;
  /** "اشتراك شهري" / "Monthly subscription" — already localized by the caller. */
  description: string;
  /** Who received the money (center or teacher display name). */
  payeeName: string;
  method: "card" | "wallet" | "cash";
  paidAt: Date;
  /** Optional link to the in-app payment record. */
  link?: string | null;
};

/**
 * The weekly center digest.
 *
 * Every figure arrives ALREADY COMPUTED by the cron job, which reads them from
 * the same report services the dashboard uses. The template formats and does
 * not calculate — an email that derived its own revenue would be a second set
 * of books.
 */
export type WeeklyDigestData = {
  centerName: string;
  /** YYYY-MM-DD, inclusive. */
  periodStart: string;
  periodEnd: string;
  /** Piasters, formatted by the template so every surface agrees. */
  revenuePiasters: number;
  expensesPiasters: number;
  netPiasters: number;
  /** Whole percent, as the reports screen shows it. */
  attendanceRatePct: number;
  sessionsCount: number;
  /** Blocking findings from the completeness report; 0 means nothing pending. */
  gapsCount: number;
  /** Reports screen behind the normal login. Never a token. */
  link?: string | null;
};

/**
 * Guardian email verification.
 *
 * Sent TO the guardian address. The link mints no session — it can only mark
 * the address confirmed — and the copy says so, because an unexplained link to
 * a parent is indistinguishable from phishing.
 */
export type GuardianVerificationData = {
  /** The child, so a wrong recipient can tell it is not theirs. */
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

// -----------------------------------------------------------------------------
// Channels
// -----------------------------------------------------------------------------

/**
 * A delivery driver.
 *
 * CONTRACT: `send` NEVER THROWS. Every call site in this codebase treats
 * notification delivery as best-effort — a dead SMTP host must not roll back a
 * registration, and a failed receipt must not un-settle money that already
 * committed. Failures come back as `{ status: "failed" }`.
 */
export interface NotificationChannel {
  readonly id: ChannelId;
  /**
   * Whether this channel is switched on in this environment. `false` means the
   * dispatcher records `skipped` — a deliberate non-send, not a fault.
   */
  isEnabled(): boolean;
  /**
   * Whether this channel can render this template at all. A channel that has no
   * renderer for a template reports `skipped`, so adding a template never
   * silently breaks a channel that has not caught up with it.
   */
  supports(template: TemplateId): boolean;
  send<T extends TemplateId>(
    template: T,
    to: Recipient,
    data: TemplateData<T>,
  ): Promise<ChannelResult>;
}

/** What a template hands a channel once rendered. */
export type RenderedEmail = {
  subject: string;
  html: string;
  /** A missing plain-text alternative is a strong spam signal. Always present. */
  text: string;
};

/**
 * The WhatsApp shape, declared here rather than in the (unbuilt) channel so a
 * template can carry its WhatsApp payload the day the number is verified. Meta's
 * Cloud API takes a pre-approved template name plus positional params — there is
 * no free-form HTML, which is exactly why this is a separate renderer and not a
 * transform of the email body.
 */
export type RenderedWhatsApp = {
  template: string;
  params: string[];
};
