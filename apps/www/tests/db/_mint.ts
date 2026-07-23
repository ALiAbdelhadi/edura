// Mint NextAuth v4 JWE session cookies for API verification (no password needed).
import { encode } from "next-auth/jwt";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;

const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });

async function main() {
  const emails = process.argv.slice(2);
  const { rows } = await pool.query(
    `select u.id, u.email, u.role, u.locale, u.token_version,
            (select cap.center_id from center_admin_profiles cap where cap.user_id = u.id limit 1) as admin_center,
            (select cs.center_id from center_staff cs where cs.staff_user_id = u.id and cs.removed_at is null limit 1) as staff_center
       from users u where u.email = any($1::text[])`,
    [emails],
  );
  const out: Record<string, unknown> = {};
  for (const r of rows) {
    const isSA = r.role === "super_admin" || r.role === "accountant";
    const secret = isSA
      ? (process.env.SUPERADMIN_NEXTAUTH_SECRET ?? process.env.NEXTAUTH_SECRET)!
      : process.env.NEXTAUTH_SECRET!;
    const token = {
      name: r.email, email: r.email, sub: r.id,
      uid: r.id, role: r.role,
      centerId: r.admin_center ?? r.staff_center ?? undefined,
      locale: r.locale, ver: r.token_version,
    };
    const jwe = await encode({ token: token as never, secret, maxAge: 60 * 60 * 24 * 30 });
    out[r.email] = {
      id: r.id, role: r.role, centerId: r.admin_center ?? r.staff_center ?? null,
      cookieName: isSA ? "edura-superadmin.session-token" : "next-auth.session-token",
      jwe,
    };
  }
  console.log(JSON.stringify(out, null, 2));
  await pool.end();
}
main();
