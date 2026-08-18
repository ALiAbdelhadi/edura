import * as React from "react";
import type { Locale } from "../locale";
import type {
  RenderedWhatsApp,
  TemplateData,
  TemplateDataMap,
  TemplateId,
} from "../types";
import {
  EmailVerificationEmail,
  emailVerificationSubject,
  emailVerificationText,
} from "./email-verification";
import {
  PasswordResetEmail,
  passwordResetSubject,
  passwordResetText,
} from "./password-reset";
import {
  PaymentReceiptEmail,
  paymentReceiptSubject,
  paymentReceiptText,
} from "./payment-receipt";
import {
  GuardianVerificationEmail,
  guardianVerificationSubject,
  guardianVerificationText,
} from "./guardian-verification";
import {
  WeeklyDigestEmail,
  weeklyDigestSubject,
  weeklyDigestText,
} from "./weekly-digest";
import { WelcomeEmail, welcomeSubject, welcomeText } from "./welcome";

// =============================================================================
// The template registry.
//
// A template declares one renderer PER CHANNEL, never one body that channels
// transform. An email is HTML with a subject line; a WhatsApp message is a
// Meta-approved template name plus positional params. Pretending those are the
// same thing is how you end up mailing "{{1}}" to a parent.
//
// `whatsapp` is optional and every template omits it today — no verified Meta
// business number exists yet. A channel with no renderer for a template reports
// `skipped`, so shipping the WhatsApp channel before its templates are approved
// degrades gracefully instead of failing sends.
// =============================================================================

export type EmailRenderer<T extends TemplateId> = {
  subject(locale: Locale, data: TemplateData<T>): string;
  Body(props: { locale: Locale; data: TemplateData<T> }): React.JSX.Element;
  text(locale: Locale, data: TemplateData<T>): string;
};

export type TemplateDefinition<T extends TemplateId> = {
  id: T;
  email: EmailRenderer<T>;
  whatsapp?: (locale: Locale, data: TemplateData<T>) => RenderedWhatsApp;
};

type Registry = { [K in keyof TemplateDataMap]: TemplateDefinition<K> };

export const TEMPLATES: Registry = {
  welcome: {
    id: "welcome",
    email: {
      subject: (locale) => welcomeSubject(locale),
      Body: (props) => <WelcomeEmail {...props} />,
      text: welcomeText,
    },
  },
  password_reset: {
    id: "password_reset",
    email: {
      subject: (locale) => passwordResetSubject(locale),
      Body: (props) => <PasswordResetEmail {...props} />,
      text: passwordResetText,
    },
  },
  email_verification: {
    id: "email_verification",
    email: {
      subject: (locale) => emailVerificationSubject(locale),
      Body: (props) => <EmailVerificationEmail {...props} />,
      text: emailVerificationText,
    },
  },
  payment_receipt: {
    id: "payment_receipt",
    email: {
      subject: paymentReceiptSubject,
      Body: (props) => <PaymentReceiptEmail {...props} />,
      text: paymentReceiptText,
    },
  },
  weekly_digest: {
    id: "weekly_digest",
    email: {
      subject: weeklyDigestSubject,
      Body: (props) => <WeeklyDigestEmail {...props} />,
      text: weeklyDigestText,
    },
  },
  guardian_verification: {
    id: "guardian_verification",
    email: {
      subject: guardianVerificationSubject,
      Body: (props) => <GuardianVerificationEmail {...props} />,
      text: guardianVerificationText,
    },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATES) as TemplateId[];

export function getTemplate<T extends TemplateId>(id: T): TemplateDefinition<T> {
  const found = TEMPLATES[id];
  if (!found) throw new Error(`[notifications] unknown template "${id}"`);
  return found as TemplateDefinition<T>;
}
