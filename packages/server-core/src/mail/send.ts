type Mail = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

export async function sendMail(mail: Mail): Promise<void> {
  const provider = process.env.MAIL_PROVIDER || "console";
  const from = process.env.MAIL_FROM || "no-reply@edura.local";

  if (provider === "console") {
    // eslint-disable-next-line no-console
    console.log("\n[mail]", {
      from,
      to: mail.to,
      subject: mail.subject,
      body: mail.text || mail.html,
    });
    return;
  }

  throw new Error(`Mail provider '${provider}' not implemented`);
}
