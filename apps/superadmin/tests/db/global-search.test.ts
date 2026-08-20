/**
 * ===========================================================================
 * BACK-OFFICE GLOBAL SEARCH — one box over the whole platform, and its limits.
 * ===========================================================================
 * Drives the REAL shipped service against the live DB:
 *   apps/superadmin/src/lib/services/admin/global-search.ts
 *
 * The palette here searched twenty-one destinations; it now searches records
 * too, which makes it the widest read surface in the back office. So the proofs
 * are about the boundary as much as the feature:
 *
 *   • THE ROLE SPLIT. A super_admin reaches people, centers and payment
 *     attempts; an accountant reaches PAYMENT ATTEMPTS AND NOTHING ELSE. That
 *     asymmetry is the one a widening would erase, and it is asserted as a set,
 *     not by spot-checking one absence.
 *   • PEOPLE ARE GROUPED BY ROLE, so the heading a reader sees is the role, and
 *     a teacher never lands under "Students".
 *   • THE STUDENT CODE RESOLVES. It is the one key the users LIST cannot use
 *     (it lives on student_profiles), and it is what a receptionist reads down
 *     the phone. It is not a widening: it lands on a user this role can already
 *     list.
 *   • NO WIDER THAN THE LIST SCREEN. A soft-deleted user is absent, because the
 *     provider calls `listUsers` as-is and the client extension excludes them.
 *   • EVERY href IS A DESTINATION OF THE PORTAL THAT ASKED — the accountant's
 *     hits land in /dashboard/finance, never in /dashboard/superadmin.
 *   • A PREFIX IS NOT A SEARCH. One character runs no provider at all.
 *   • IT WRITES NOTHING — no row, and in particular no audit row. This matters
 *     more here than in the ERP: `buildStudentCard` audits `student.card_viewed`
 *     precisely so a card read leaves a trace, and a search that reached an
 *     audited surface would be a second, quieter door onto it.
 *
 * Nothing is mocked: the real `backOfficeSearch` runs against the live DB.
 */
import { testPool } from "../../../../packages/database/scripts/test-pool";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { backOfficeSearch } from "@/lib/services/admin/global-search";
import type { SessionUser } from "@/lib/auth/session";

import { assertDbEnv } from "../../../../packages/database/scripts/db-guard";
const admin = testPool();

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
function section(t: string) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 64 - t.length))}`);
}

type Hit = { kind: string; title: string; href: string; badge?: string };
type Result = { q: string; groups: { kind: string; hits: Hit[] }[]; truncated: boolean };

const kinds = (r: Result) => r.groups.map((g) => g.kind);
const hits = (r: Result, kind: string) =>
  r.groups.find((g) => g.kind === kind)?.hits ?? [];
const titles = (r: Result, kind: string) => hits(r, kind).map((h) => h.title);
const allHits = (r: Result) => r.groups.flatMap((g) => g.hits);

async function main() {
  const tag = "bogs-" + Math.floor(Math.random() * 1e9).toString(36);
  const WORD = `${tag}zebra`;
  /* §7 — written as a register writes it. Every query against it below is the
   * SAME name typed the way people type it: no hamza (it needs Shift), ه for
   * ة, and the family name first as often as last. */
  const AR_NAME = `فاطمة إبراهيم ${tag}`;
  const AR_CENTER = `مركز النيلة ${tag}`;
  const ids: string[] = [];
  const centerIds: string[] = [];

  const superAdmin = crypto.randomUUID();
  const accountant = crypto.randomUUID();
  const student = crypto.randomUUID();
  const teacher = crypto.randomUUID();
  const parent = crypto.randomUUID();
  const assistant = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const staff = crypto.randomUUID();
  const deleted = crypto.randomUUID();
  // Stored the way a register holds an Egyptian name — with the hamza and the
  // ta marbuta — so §7 can type it the way a counter keyboard produces them.
  const arabic = crypto.randomUUID();
  ids.push(
    superAdmin, accountant, student, teacher, parent, assistant, owner, staff,
    deleted, arabic,
  );

  const centerId = crypto.randomUUID();
  centerIds.push(centerId);

  const asUser = (id: string, role: string): SessionUser =>
    ({ id, role, locale: "ar" } as SessionUser);

  const census = async () => {
    const r = await admin.query(
      `SELECT
         (SELECT count(*) FROM users)           AS users,
         (SELECT count(*) FROM centers)         AS centers,
         (SELECT count(*) FROM payment_intents) AS intents,
         (SELECT count(*) FROM transactions)    AS transactions,
         (SELECT count(*) FROM audit_logs)      AS audit_logs`,
    );
    return JSON.stringify(r.rows[0]);
  };

  try {
    console.log("Back-office global search —", tag);

    /* ── fixtures ─────────────────────────────────────────────────────── */
    const mkUser = async (id: string, role: string, name: string, status = "active") => {
      await admin.query(
        `INSERT INTO users (id, email, role, name, status, is_demo, created_at, updated_at)
         VALUES ($1, $2, $3::role, $4, $5::user_status, true, now(), now())`,
        [id, `${id}@${tag}.test`, role, name, status],
      );
    };
    await mkUser(superAdmin, "super_admin", `${WORD} Root`);
    await mkUser(accountant, "accountant", `${WORD} Books`);
    await mkUser(student, "student", `${WORD} Pupil`);
    await mkUser(teacher, "teacher", `${WORD} Tutor`);
    await mkUser(parent, "parent", `${WORD} Guardian`);
    await mkUser(assistant, "assistant", `${WORD} Helper`);
    await mkUser(owner, "center_admin", `${WORD} Boss`);
    await mkUser(staff, "center_staff", `${WORD} Desk`);
    await mkUser(deleted, "student", `${WORD} Gone`);
    await mkUser(arabic, "teacher", AR_NAME);
    // Soft-deleted, exactly as the app soft-deletes: the client extension is
    // what hides it, and this proves the provider inherits that and does not
    // re-implement a `where`.
    await admin.query(`UPDATE users SET deleted_at = now() WHERE id = $1`, [deleted]);

    await admin.query(
      `INSERT INTO student_profiles (id, user_id, full_name, family_link_code, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now())`,
      [student, `${WORD} Pupil`, student.slice(0, 8).toUpperCase()],
    );
    const studentCode: string = (
      await admin.query(`SELECT student_code FROM student_profiles WHERE user_id = $1`, [student])
    ).rows[0].student_code;

    await admin.query(
      `INSERT INTO centers (id, name, short_id, status, area, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, 'active'::center_status, $4, true, now(), now())`,
      [centerId, `${WORD} Academy`, `${tag.slice(0, 8).toUpperCase()}`, `${WORD} Maadi`],
    );
    const arCenterId = crypto.randomUUID();
    centerIds.push(arCenterId);
    await admin.query(
      `INSERT INTO centers (id, name, short_id, status, area, is_demo, created_at, updated_at)
       VALUES ($1, $2, $3, 'active'::center_status, $4, true, now(), now())`,
      [arCenterId, AR_CENTER, `AR${tag.slice(0, 6).toUpperCase()}`, `المعادى ${tag}`],
    );

    const intentRef = `GWREF-${tag.toUpperCase()}`;
    await admin.query(
      `INSERT INTO payment_intents
         (id, student_id, amount, currency, gateway, method, status, gateway_ref,
          idempotency_key, expires_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 12345, 'EGP', 'mock'::payment_gateway,
               'card'::payment_intent_method, 'pending'::payment_intent_status, $2, $3,
               now() + interval '1 hour', now(), now())`,
      [student, intentRef, `idem-${tag}`],
    );

    const before = await census();

    /* ── 1) the super admin's reach ───────────────────────────────────── */
    section("1. A super admin reaches people, centers and payments");
    const root = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: WORD,
    })) as Result;

    assert(titles(root, "student").includes(`${WORD} Pupil`), "finds a student");
    assert(titles(root, "teacher").includes(`${WORD} Tutor`), "finds a teacher");
    assert(titles(root, "parent").includes(`${WORD} Guardian`), "finds a parent");
    assert(titles(root, "assistant").includes(`${WORD} Helper`), "finds an assistant");
    assert(
      titles(root, "center_admin").includes(`${WORD} Boss`),
      "finds a center owner",
    );
    assert(titles(root, "staff").includes(`${WORD} Desk`), "finds a center staff member");
    assert(
      titles(root, "back_office").includes(`${WORD} Books`) &&
        titles(root, "back_office").includes(`${WORD} Root`),
      "finds back-office accounts, both roles under one heading",
    );
    assert(
      titles(root, "center").includes(`${WORD} Academy`),
      "finds a center by name",
    );

    assert(
      !allHits(root).some((h) => h.title.includes("Gone")),
      "a SOFT-DELETED user is absent — the provider inherits the list's own exclusion",
    );

    // Grouping is the point: a role must never land under another role's
    // heading, which one flat "user" kind would have made unnoticeable.
    const misfiled = root.groups.filter(
      (g) => g.kind === "student" && g.hits.some((h) => h.title.includes("Tutor")),
    );
    assert(misfiled.length === 0, "a teacher never appears under Students");

    /* ── 2) the identifier the list cannot use ────────────────────────── */
    section("2. The student code");
    const byCode = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: studentCode,
    })) as Result;
    assert(
      titles(byCode, "student").includes(`${WORD} Pupil`),
      "a student CODE resolves the student — the key the users list has no column for",
    );
    assert(
      hits(byCode, "student")[0]?.badge === studentCode,
      "…and the code is drawn as the row's badge",
    );
    assert(
      hits(byCode, "student")[0]?.href === `/dashboard/superadmin/users/${student}`,
      "…landing on their user record, the page the back office already holds",
    );
    const codeLower = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: studentCode.toLowerCase(),
    })) as Result;
    assert(
      titles(codeLower, "student").includes(`${WORD} Pupil`),
      "the code is case-insensitive — nobody types a card in caps",
    );

    /* ── 3) centers by every key a human uses ─────────────────────────── */
    section("3. Centers");
    const byShortId = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: tag.slice(0, 8).toUpperCase(),
    })) as Result;
    assert(
      titles(byShortId, "center").includes(`${WORD} Academy`),
      "a center resolves by its SHORT ID — what it is called over the phone",
    );
    assert(
      hits(root, "center")[0]?.href === `/dashboard/superadmin/centers/${centerId}`,
      "a center hit opens its record page",
    );

    /* ── 4) THE ROLE SPLIT ────────────────────────────────────────────── */
    section("4. The accountant reaches money and nothing else");
    const books = (await backOfficeSearch(asUser(accountant, "accountant"), {
      q: WORD,
    })) as Result;
    // EXACT, not "contains no people". The intent's payer IS the student named
    // in this query — `listPaymentIntents` matches on the payer's name — so the
    // accountant legitimately gets ONE group back. Asserting the exact set is
    // what distinguishes "money only" from "nothing at all", and only the first
    // of those is the behaviour being claimed.
    assert(
      kinds(books).join(",") === "payment_intent",
      `an accountant searching a NAME reaches the payment and NO people, centers or staff (got: ${kinds(books).join(",") || "nothing"})`,
    );
    assert(
      hits(books, "payment_intent").length === 1,
      "…and it is the payment whose payer bears that name",
    );

    const booksMoney = (await backOfficeSearch(asUser(accountant, "accountant"), {
      q: intentRef,
    })) as Result;
    assert(
      kinds(booksMoney).join(",") === "payment_intent",
      "…but DOES reach an online payment by its gateway reference",
    );
    assert(
      allHits(booksMoney).every((h) => h.href.startsWith("/dashboard/finance/")),
      "and every accountant hit lands in the FINANCE portal, never the super admin's",
    );

    const rootMoney = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: intentRef,
    })) as Result;
    assert(
      hits(rootMoney, "payment_intent").length === 1,
      "the super admin reaches the same payment",
    );
    assert(
      hits(rootMoney, "payment_intent")[0]?.href.startsWith("/dashboard/superadmin/"),
      "…at their OWN portal's copy of that screen",
    );

    /* ── 5) a prefix is not a search ──────────────────────────────────── */
    section("5. The floor");
    const short = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: "z",
    })) as Result;
    assert(short.groups.length === 0, "a one-character query runs no provider at all");
    const blank = (await backOfficeSearch(asUser(superAdmin, "super_admin"), {
      q: "   ",
    })) as Result;
    assert(blank.groups.length === 0, "whitespace is not a query either");

    /* ── 7) THE NAME AS IT IS ACTUALLY TYPED ──────────────────────────── */
    section("7. Arabic as an Egyptian types it");
    // CONTROL FIRST. `contains` with `mode: "insensitive"` is ILIKE, which folds
    // ASCII case and NOTHING else — so this palette answered "nobody" about the
    // platform's own directory whenever the reader left out a hamza. The
    // assertion below proves the DATABASE still cannot do it unaided, which is
    // what makes the ones after it measure the fix and not the data.
    const rawIlike = await admin.query(
      `SELECT count(*)::int AS n FROM users WHERE id = $1 AND name ILIKE '%' || $2 || '%'`,
      [arabic, `فاطمه ${tag}`],
    );
    assert(
      rawIlike.rows[0].n === 0,
      "CONTROL: raw ILIKE finds nothing for «فاطمه» against a row stored «فاطمة»",
    );

    const arSearch = async (q: string) =>
      (await backOfficeSearch(asUser(superAdmin, "super_admin"), { q })) as Result;

    assert(
      titles(await arSearch(`فاطمه ${tag}`), "teacher").includes(AR_NAME),
      "ta marbuta: «فاطمه» finds «فاطمة» in the platform directory",
    );
    assert(
      titles(await arSearch(`ابراهيم ${tag}`), "teacher").includes(AR_NAME),
      "hamza: «ابراهيم» finds «إبراهيم»",
    );
    assert(
      titles(await arSearch(`${tag} ابراهيم فاطمه`), "teacher").includes(AR_NAME),
      "word order: the family name typed first still finds the row",
    );
    assert(
      !titles(await arSearch(`سعاد ${tag}`), "teacher").includes(AR_NAME),
      "…and it is NOT fuzzy: a different name finds nothing",
    );
    assert(
      titles(await arSearch(`مركز النيله ${tag}`), "center").includes(AR_CENTER),
      "the centers provider folds too: «النيله» finds «النيلة»",
    );
    assert(
      titles(await arSearch(`المعادي ${tag}`), "center").includes(AR_CENTER),
      "…and matches on the AREA, which is how a back office is told where a centre is",
    );

    /* ── 6) it writes nothing, and reaches nothing audited ────────────── */
    section("6. Read-only, and no quiet door");
    assert(
      (await census()) === before,
      "every search above wrote no row — and no audit row",
    );

    const src = readFileSync(
      fileURLToPath(new URL("../../src/lib/services/admin/global-search.ts", import.meta.url)),
      "utf8",
    );
    const importLines = src
      .split("\n")
      .filter((l) => l.startsWith("import"))
      .join("\n");
    assert(
      !/(wallet|payout|ledger|transaction|invoice|settlement|student-card)/i.test(importLines),
      "the module imports no money service and no audited card reader",
    );
    assert(
      !/auditLog|audit_log/i.test(src),
      "…and writes no audit row of its own, so the audited surfaces stay the only door to themselves",
    );
  } finally {
    await admin.query(`DELETE FROM payment_intents WHERE student_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM student_profiles WHERE user_id = ANY($1::uuid[])`, [ids]);
    await admin.query(`DELETE FROM centers WHERE id = ANY($1::uuid[])`, [centerIds]);
    await admin.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    await admin.end();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

assertDbEnv(["test"], { intent: "suite global-search.test.ts" })
  .then(() => main())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
