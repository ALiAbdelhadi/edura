/**
 * API-verification fixtures.
 * Resolves demo/seed entities from the live DB and mints NextAuth JWE session
 * cookies for every actor role, then dumps everything as JSON for the sweep
 * scripts. READ-ONLY against the DB.
 */
import { encode } from "next-auth/jwt";
import { neonConfig, Pool } from "@neondatabase/serverless";
import ws from "ws";
neonConfig.webSocketConstructor = ws as never;

const pool = new Pool({ connectionString: process.env.ADMIN_URL ?? process.env.DIRECT_URL });
const q = async (s: string, p: unknown[] = []) => {
  try { return (await pool.query(s, p)).rows; }
  catch (e) { console.error("FIXTURE-QUERY-FAILED:", (e as Error).message, "|", s.slice(0, 90)); return []; }
};
const one = async (s: string, p: unknown[] = []) => (await q(s, p))[0] ?? null;

const NILE = "27341830-38a3-4a74-8ace-59028c23a9d1";
const ANDL = "19243e75-331c-40e5-b09b-794b0d3812d7";
const FUTR = "cf4fdbbe-129a-4e8c-bfce-447902b4a952";
const BRGT = "a8343c6a-50b1-4603-9f01-cb4513fe4bef";

const ACTOR_EMAILS: Record<string, string> = {
  superadmin: "superadmin.demo@edura.eg",
  accountant: "tarekaccountant@edura.com",
  centerAdmin: "admin@nile-academy.eg",
  receptionist: "reception@nile-academy.eg",
  manager: "manager@nile-academy.eg",
  centerAccountant: "accountant@nile-academy.eg",
  teacher: "hossam.aziz@nile-academy.eg",
  teacherAlien: "khaled.samir@andalus.eg",
  assistant: "sara.fawzy@nile-academy.eg",
  parent: "mona.hassan@email.eg",
  student: "lina.hassan@student.nile-academy.eg",
  teacherPending: "tamer.fouad@preview.edura.eg",
  msgTeacher: "msgdemo-kamal@edura.test",
  msgStudent: "msgdemo-student-a@edura.test",
  msgParent: "msgdemo-amira@edura.test",
  msgAssistant: "msgdemo-salma@edura.test",
  msgCenterAdmin: "msgdemo-hoda@edura.test",
  msgReception: "msgdemo-mona@edura.test",
};

async function mint(email: string) {
  const r = await one(
    `select u.id,u.email,u.role,u.locale,u.token_version,u.status,
        (select cap.center_id from center_admin_profiles cap where cap.user_id=u.id limit 1) admin_center,
        (select cs.center_id from center_staff cs where cs.staff_user_id=u.id and cs.removed_at is null limit 1) staff_center
     from users u where lower(u.email)=lower($1)`,
    [email],
  );
  if (!r) return null;
  const isSA = r.role === "super_admin" || r.role === "accountant";
  const secret = (isSA
    ? process.env.SUPERADMIN_NEXTAUTH_SECRET ?? process.env.NEXTAUTH_SECRET
    : process.env.NEXTAUTH_SECRET) as string;
  const centerId = r.admin_center ?? r.staff_center ?? undefined;
  const jwe = await encode({
    token: {
      name: r.email, email: r.email, sub: r.id,
      uid: r.id, role: r.role, centerId, locale: r.locale, ver: r.token_version,
    } as never,
    secret,
    maxAge: 60 * 60 * 24 * 30,
  });
  return {
    email: r.email, id: r.id, role: r.role, status: r.status,
    centerId: centerId ?? null,
    app: isSA ? "superadmin" : "www",
    cookie: `${isSA ? "edura-superadmin.session-token" : "next-auth.session-token"}=${jwe}`,
  };
}

async function main() {
  const actors: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const [k, email] of Object.entries(ACTOR_EMAILS)) {
    const a = await mint(email);
    if (a) actors[k] = a;
    else missing.push(`${k}=${email}`);
  }

  // a second msgdemo student (any student in the msgdemo center)
  const msgStudents = await q(
    `select u.id,u.email from users u join enrollments e on e.student_id=u.id
      where u.role='student' and u.is_demo=true and e.center_id='6579d76e-d537-9d34-4c35-e99ca688f973' limit 3`,
  );
  for (const s of msgStudents) {
    const a = await mint(s.email);
    if (a && !actors.msgStudentResolved) actors.msgStudentResolved = a;
  }

  const f: Record<string, unknown> = {};
  f.centerNile = NILE; f.centerAndl = ANDL; f.centerFutr = FUTR; f.centerPending = BRGT;
  f.centerAlien = "6579d76e-d537-9d34-4c35-e99ca688f973";
  actors.centerAdminAlien = actors.msgCenterAdmin;
  f.courseAlien = await one(`select id,title,teacher_id,center_id from courses where center_id='6579d76e-d537-9d34-4c35-e99ca688f973' limit 1`);
  f.sessionAlien = await one(`select s.id,s.status from sessions s join courses c on c.id=s.course_id where c.center_id='6579d76e-d537-9d34-4c35-e99ca688f973' limit 1`);
  f.roomAlien = await one(`select id,name from rooms where center_id='6579d76e-d537-9d34-4c35-e99ca688f973' limit 1`);
  f.studentAlien = await one(`select u.id,u.email from users u where u.email='msgdemo-youssef@edura.test'`);
  f.studentNile2 = await one(`select id,email from users where email='omar.khaled@student.nile-academy.eg'`);
  f.studentAndl = await one(`select id,email from users where email='youssef.adel@student.andalus.eg'`);
  f.courseNile = "4d1da783-79dc-f1b8-a948-c3e90e460997";
  f.courseNile2 = "3c4085a7-7d71-4c13-bbc2-28a1bb904a48";
  f.courseAndl = await one(`select id,title,teacher_id from courses where center_id=$1 limit 1`, [ANDL]);
  f.sessionScheduled = await one(`select s.id,s.date,s.status from sessions s join courses c on c.id=s.course_id where c.center_id=$1 and s.status='scheduled' order by s.date limit 1`, [NILE]);
  f.sessionCompleted = await one(`select s.id,s.date,s.status,s.distributed_at from sessions s join courses c on c.id=s.course_id where c.center_id=$1 and s.status='completed' order by s.date desc limit 1`, [NILE]);
  f.sessionAndl = await one(`select s.id,s.status from sessions s join courses c on c.id=s.course_id where c.center_id=$1 limit 1`, [ANDL]);
  f.roomNile = await one(`select id,name from rooms where center_id=$1 limit 1`, [NILE]);
  f.roomAndl = await one(`select id,name from rooms where center_id=$1 limit 1`, [ANDL]);
  f.enrollmentNile = await one(`select id,student_id,course_id from enrollments where center_id=$1 and status='active' limit 1`, [NILE]);
  f.enrollmentAndl = await one(`select id,student_id,course_id from enrollments where center_id=$1 limit 1`, [ANDL]);
  f.parentLinkApproved = await one(`select id,parent_id,student_id from parent_student_links where status='approved' limit 1`);
  f.parentLinkPending = await one(`select id,parent_id,student_id from parent_student_links where status='pending' limit 1`);
  f.teacherAssistant = await one(`select id,teacher_id,assistant_id from teacher_assistants where removed_at is null and teacher_id=(select id from users where email='hossam.aziz@nile-academy.eg')`);
  f.centerStaffNile = await q(`select id,role,staff_user_id from center_staff where center_id=$1 and removed_at is null`, [NILE]);
  f.material = await one(`select id,course_id,center_id,type from materials limit 1`);
  f.materialNile = await one(`select m.id,m.course_id from materials m join courses c on c.id=m.course_id where c.center_id=$1 limit 1`, [NILE]);
  f.grade = await one(`select id,course_id,center_id,teacher_id from grades where center_id=$1 limit 1`, [NILE]);
  f.gradeAny = await one(`select id,course_id,center_id from grades limit 1`);
  f.review = await one(`select id,student_id,teacher_id,rating from reviews limit 1`);
  f.expense = await one(`select id,center_id,amount from expenses where center_id=$1 limit 1`, [NILE]);
  f.expenseAny = await one(`select id,center_id from expenses limit 1`);
  f.payment = await one(`select id,student_id,course_id,amount,status,center_id from payments order by created_at desc limit 1`);
  f.paymentNile = await one(`select p.id,p.amount,p.status from payments p where p.center_id=$1 order by p.created_at desc limit 1`, [NILE]);
  f.transaction = await one(`select id,type,status,amount from transactions order by created_at desc limit 1`);
  f.invoice = await one(`select id,type,status,net_amount from invoices order by created_at desc limit 1`);
  f.payoutPending = await one(`select id,beneficiary_type,beneficiary_id,status,net_payable from payouts where status='pending' order by created_at desc limit 1`);
  f.payoutAny = await one(`select id,beneficiary_type,status,net_payable from payouts order by created_at desc limit 1`);
  f.paymentIntent = await one(`select id,status,amount,student_id from payment_intents order by created_at desc limit 1`);
  f.paymentIntentPending = await one(`select id,status,amount,student_id from payment_intents where status='pending' order by created_at desc limit 1`);
  f.notificationSuper = await one(`select id,user_id,type,status from notifications where user_id=(select id from users where email='superadmin.demo@edura.eg') order by created_at desc limit 1`);
  f.notificationStudent = await one(`select id,user_id,type,status from notifications where user_id=(select id from users where email='lina.hassan@student.nile-academy.eg') order by created_at desc limit 1`);
  f.notificationAny = await one(`select id,user_id,type from notifications order by created_at desc limit 1`);
  f.blacklistEntry = await one(`select id,level,target_id,center_id,is_active from blacklist_entries where is_active=true limit 1`);
  f.collabRequest = await one(`select id,status,center_id,teacher_id,initiator from collaboration_requests order by created_at desc limit 1`);
  f.collabPending = await one(`select id,status,center_id,teacher_id,initiator from collaboration_requests where status='pending' order by created_at desc limit 1`);
  f.enrollRequest = await one(`select id,status,student_id,course_id,center_id from enrollment_requests order by created_at desc limit 1`);
  f.enrollRequestPending = await one(`select id,status,student_id,course_id,center_id from enrollment_requests where status='pending' order by created_at desc limit 1`);
  f.attendance = await one(`select id,session_id,student_id,status from attendance_records limit 1`);
  f.deletionRequest = await one(`select id,user_id,status from deletion_requests order by created_at desc limit 1`);
  f.affiliation = await one(`select id,center_id,teacher_id,status from center_teacher_affiliations order by created_at desc limit 1`);
  f.affiliationPending = await one(`select id,center_id,teacher_id,status from center_teacher_affiliations where status='pending' order by created_at desc limit 1`);
  f.subjectRequest = await one(`select id,status from subject_requests order by created_at desc limit 1`);
  f.pointsRule = await one(`select id,event_name,points_value,is_active from points_rules limit 1`);
  f.tempStudent = await one(`select id,full_name,entity_type,invite_code from student_profiles where entity_type <> 'registered' limit 1`);
  f.studentProfileNile = await one(`select sp.id,sp.user_id,sp.full_name,sp.student_code,sp.family_link_code from student_profiles sp where sp.user_id=(select id from users where email='lina.hassan@student.nile-academy.eg')`);
  f.whatsappMessage = await one(`select id,template,status from whatsapp_messages order by created_at desc limit 1`);
  f.sessionSettlement = await one(`select id,session_id,course_id from session_settlements order by created_at desc limit 1`);
  f.subscription = await one(`select id,student_id,course_id,plan,status from subscriptions order by created_at desc limit 1`);

  // catalog
  f.system = await one(`select id,name_ar from education_systems limit 1`);
  f.stage = await one(`select id,name_ar,education_system_id from stages limit 1`);
  f.gradeLevel = await one(`select id,name_ar,stage_id from grade_levels limit 1`);
  f.track = await one(`select id,name_ar from tracks limit 1`);
  f.subject = await one(`select id,name_ar from subjects limit 1`);
  f.offering = await one(`select id from subject_offerings limit 1`);
  f.gradeTrack = await one(`select id from grade_level_tracks limit 1`);

  // messaging
  f.conversationDemo = await one(`select id,user_a_id,user_b_id,center_id from conversations where is_demo=true limit 1`);
  f.conversationOfStudent = await one(`select c.id,c.user_a_id,c.user_b_id from conversations c where c.user_a_id=(select id from users where email='lina.hassan@student.nile-academy.eg') or c.user_b_id=(select id from users where email='lina.hassan@student.nile-academy.eg') limit 1`);
  f.group = await one(`select id,kind,course_id,center_id,owner_id from conversation_groups limit 1`);
  f.messageAny = await one(`select id,conversation_id,sender_id from conversation_messages order by created_at desc limit 1`);
  f.reportAny = await one(`select id,status from conversation_reports order by created_at desc limit 1`);
  f.blockAny = await one(`select id from conversation_blocks limit 1`);
  f.msgCenter = "6579d76e-d537-9d34-4c35-e99ca688f973";
  f.msgConvos = await q(`select c.id,c.user_a_id,c.user_b_id,ua.email ea,ub.email eb from conversations c join users ua on ua.id=c.user_a_id join users ub on ub.id=c.user_b_id where c.is_demo=true limit 10`);
  f.msgMinorChild = await one(`select psl.student_id, u.email, sp.date_of_birth, sp.date_of_birth_verified_at from parent_student_links psl join users u on u.id=psl.student_id join student_profiles sp on sp.user_id=u.id where psl.status='approved' and psl.parent_id=(select id from users where email='msgdemo-amira@edura.test') limit 1`);

  f.secrets = {
    cronSecret: process.env.CRON_SECRET ?? null,
    internalSecret: process.env.INTERNAL_API_SECRET ?? null,
    paymobHmac: process.env.PAYMOB_HMAC_SECRET ?? null,
    paymentsMode: process.env.PAYMENTS_MODE ?? null,
    whatsappMode: process.env.WHATSAPP_MODE ?? null,
  };

  console.log(JSON.stringify({ actors, fixtures: f, missingActors: missing }, null, 2));
  await pool.end();
}
main();
