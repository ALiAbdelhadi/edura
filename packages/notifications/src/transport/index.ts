import { consoleMailDriver } from "./console-driver";
import { smtpMailDriver } from "./smtp-driver";
import type { MailDriver } from "./types";
import { mailProvider } from "./types";

export type { Mail, MailResult, MailProvider, MailDriver, OutboundMail } from "./types";
export { mailProvider } from "./types";

export function resolveMailDriver(): MailDriver {
  return mailProvider() === "smtp" ? smtpMailDriver : consoleMailDriver;
}
