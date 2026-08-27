import { testPool } from "../../../../packages/database/scripts/test-pool";
import net from "node:net";
import bcrypt from "bcryptjs";
import { requestPasswordReset, resetPassword } from "@/lib/services/auth/password-reset";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

const OLD_PW = "OldPassw0rd!";
const NEW_PW = "FreshPassw0rd!";
const SINK_PORT = 2598;

const APP_ORIGIN = "https://app.example.test";

let pass = 0;
let fail = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    pass++;
    console.log("  ✓", msg);
  } else {
    fail++;
    console.error("  ✗", msg);
  }
}

const inbox: { rcpt: string; raw: string }[] = [];

function startSink(): Promise<net.Server> {
  const server = net.createServer((sock) => {
    let inData = false;
    let buf = "";
    let rcpt = "";
    let raw = "";
    sock.write("220 sink ESMTP\r\n");
    sock.on("error", () => {});
    sock.on("data", (chunk) => {
      buf += chunk.toString();
      let i: number;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            inbox.push({ rcpt, raw });
            raw = "";
            sock.write("250 OK queued\r\n");
          } else {
            raw += (line.startsWith("..") ? line.slice(1) : line) + "\n";
          }
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO")) sock.write("250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n");
        else if (cmd.startsWith("HELO")) sock.write("250 sink\r\n");
        else if (cmd.startsWith("AUTH")) sock.write("235 auth ok\r\n");
        else if (cmd.startsWith("RCPT TO")) {
          rcpt = line.replace(/^RCPT TO:\s*/i, "").replace(/[<>]/g, "");
          sock.write("250 OK\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          sock.write("354 send data\r\n");
        } else if (cmd === "QUIT") {
          sock.write("221 bye\r\n");
          sock.end();
        } else sock.write("250 OK\r\n");
      }
    });
  });
  return new Promise((resolve) =>
    server.listen(SINK_PORT, "127.0.0.1", () => resolve(server)),
  );
}

function decodeQp(raw: string): string {
  return raw.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/g, (_m, h) =>
    String.fromCharCode(parseInt(h, 16)),
  );
}

function linkFrom(raw: string): string | null {
  const m = decodeQp(raw).match(/https?:\/\/[^\s"'<>]*reset-password\?token=[A-Za-z0-9._~-]+/);
  return m ? m[0] : null;
}

async function main() {
  const tag = "mailtest-" + Math.floor(Math.random() * 1e9).toString(36);
  const email = `${tag}@x.io`;
  const hash = await bcrypt.hash(OLD_PW, 10);

  const userId = (
    await admin.query(
      `INSERT INTO users (email, role, name, status, password_hash, updated_at)
       VALUES ($1, 'student', $2, 'active', $3, now()) RETURNING id`,
      [email, email, hash],
    )
  ).rows[0].id as string;

  const sink = await startSink();

  process.env.MAIL_PROVIDER = "smtp";
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(SINK_PORT);
  process.env.SMTP_USER = "sink";
  process.env.SMTP_PASS = "sink";
  process.env.MAIL_FROM = "no-reply@edura.eg";
  process.env.APP_BASE_URL = APP_ORIGIN;

  try {
    console.log("Password-reset mail delivery —", tag);

    await requestPasswordReset(email, "ar");
    await new Promise((r) => setTimeout(r, 300));

    assert(inbox.length === 1, "an email was actually delivered over SMTP");
    const msg = inbox[0]!;
    assert(msg.rcpt === email, "delivered to the requesting address");

    assert(
      /Content-Type:\s*multipart\/alternative/i.test(msg.raw),
      "multipart/alternative (plain-text alternative present, not spam-shaped)",
    );
    assert(/Content-Type:\s*text\/html/i.test(msg.raw), "carries an HTML part");
    assert(/Content-Type:\s*text\/plain/i.test(msg.raw), "carries a plain-text part");
    assert(/dir=3D"rtl"|dir="rtl"/.test(msg.raw), "Arabic email renders RTL");

    const link = linkFrom(msg.raw);
    assert(link !== null, "email body contains a reset link");
    assert(
      link!.startsWith(`${APP_ORIGIN}/ar/reset-password?token=`),
      `link uses APP_BASE_URL + locale segment (${link})`,
    );

    const token = new URL(link!).searchParams.get("token")!;
    await resetPassword(token, NEW_PW);
    const after = (
      await admin.query(`SELECT password_hash FROM users WHERE id = $1`, [userId])
    ).rows[0].password_hash as string;
    assert(await bcrypt.compare(NEW_PW, after), "the token FROM THE EMAIL resets the password");

    inbox.length = 0;
    await requestPasswordReset(email, "en");
    await new Promise((r) => setTimeout(r, 300));
    assert(inbox.length === 1, "second request delivers again");
    const enLink = linkFrom(inbox[0]!.raw);
    assert(enLink?.includes("/en/reset-password") === true, "English request links to the /en page");
    assert(/dir=3D"ltr"|dir="ltr"/.test(inbox[0]!.raw), "English email renders LTR");

    inbox.length = 0;
    let threw = false;
    await requestPasswordReset(`${tag}-nobody@x.io`, "ar").catch(() => (threw = true));
    await new Promise((r) => setTimeout(r, 200));
    assert(!threw, "unknown address does not throw");
    assert(inbox.length === 0, "unknown address sends no email");

    process.env.SMTP_PORT = "2597"; // nothing listening
    let threwOnDeadHost = false;
    await requestPasswordReset(email, "ar").catch(() => (threwOnDeadHost = true));
    assert(!threwOnDeadHost, "a dead SMTP host does not throw (no 500, no enumeration oracle)");
  } finally {
    sink.close();
    await admin.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [userId]);
    await admin.query(`DELETE FROM users WHERE id = $1`, [userId]);
    await admin.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite mail-password-reset.test.ts" })
  .then(() => main()).catch((e) => {
  console.error(e);
  process.exit(1);
});
