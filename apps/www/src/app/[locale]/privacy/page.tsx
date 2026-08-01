import { LegalPage } from "@/features/legal/legal-page";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "سياسة الخصوصية — Edura" };

/**
 * DRAFT privacy policy — every claim here reflects how the system actually
 * works today (default-minor, guardian oversight, Paymob, audit logs,
 * soft-delete). Needs review by qualified Egyptian counsel before the official
 * launch.
 */
export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const ar = locale === "ar";
  return (
    <LegalPage
      locale={locale}
      title={ar ? "سياسة الخصوصية" : "Privacy Policy"}
      updated={ar ? "١ أغسطس ٢٠٢٦" : "August 1, 2026"}
    >
      {ar ? (
        <>
          <section>
            <h2>١. البيانات التي نجمعها</h2>
            <ul>
              <li>بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، الدور، وكلمة مرور مشفّرة.</li>
              <li>بيانات تشغيلية: الفصول، الحضور، الدرجات، الاشتراكات، وسجلات المدفوعات والمحافظ.</li>
              <li>بيانات ولي الأمر/الوصي للطلاب القُصّر (بريد أو هاتف) لأغراض الإشراف والتواصل.</li>
              <li>سجلات فنية: توقيتات الدخول وسجلات تدقيق للعمليات الحساسة.</li>
            </ul>
          </section>
          <section>
            <h2>٢. حماية القُصّر — قاعدة أساسية</h2>
            <ul>
              <li>أي طالب لم يثبت بلوغه ١٨ عامًا ببيانات موثّقة يُعامل تلقائيًا كقاصر.</li>
              <li>مراسلة القاصر للبالغين على المنصة مشروطة بوجود قناة تواصل لولي الأمر، ولوليّ الأمر المرتبط بحساب معتمد اطّلاع للقراءة فقط على محادثات ابنه مع البالغين، مع إعلان ذلك للطرفين.</li>
              <li>لا نبيع بيانات الطلاب ولا نستخدمها في إعلانات.</li>
            </ul>
          </section>
          <section>
            <h2>٣. المدفوعات</h2>
            <p>
              الدفع بالبطاقات والمحافظ الإلكترونية يتم عبر مزوّد الدفع المرخّص (Paymob) على صفحاته
              الآمنة — <strong>لا نخزّن أرقام البطاقات إطلاقًا</strong>. نحتفظ بسجل العملية (المبلغ،
              الوقت، الحالة، مرجع العملية) لأغراض المحاسبة والاسترداد.
            </p>
          </section>
          <section>
            <h2>٤. من يرى بياناتك</h2>
            <ul>
              <li>السنتر والمدرّس يريان بيانات طلابهما المرتبطين بهما فقط (حضور، درجات، مدفوعات حصصهم).</li>
              <li>ولي الأمر يرى بيانات أبنائه المرتبطين بحسابه باعتماد.</li>
              <li>فريق تشغيل المنصة يصل للبيانات للتشغيل والدعم، وكل عملياته الحساسة مسجلة في سجل تدقيق غير قابل للتعديل.</li>
              <li>لا نشارك بياناتك مع أطراف ثالثة إلا لمزوّدي خدمات التشغيل (الدفع، البريد، الاستضافة) أو بموجب التزام قانوني.</li>
            </ul>
          </section>
          <section>
            <h2>٥. الأمان</h2>
            <ul>
              <li>الاتصال مشفّر (HTTPS)، وكلمات المرور مخزّنة بتجزئة قوية لا يمكن عكسها.</li>
              <li>عزل بيانات كل سنتر على مستوى قاعدة البيانات، وسجلات مالية لا تقبل التعديل أو الحذف.</li>
              <li>تغيير كلمة المرور يُنهي الجلسات القديمة على كل الأجهزة.</li>
            </ul>
          </section>
          <section>
            <h2>٦. الاحتفاظ والحذف</h2>
            <ul>
              <li>الحذف داخل المنصة حذف منطقي يخفي البيانات من الاستخدام مع بقاء السجلات المالية والتدقيقية المطلوبة قانونًا.</li>
              <li>يمكنك طلب تصحيح بياناتك أو حذف حسابك، وننفذ الطلب بما لا يخل بالالتزامات القانونية والمحاسبية.</li>
            </ul>
          </section>
          <section>
            <h2>٧. ملفات الارتباط (Cookies)</h2>
            <p>
              نستخدم ملفات ارتباط أساسية لتسجيل الدخول وتفضيلات اللغة والمظهر فقط — لا توجد ملفات
              تتبع إعلانية.
            </p>
          </section>
          <section>
            <h2>٨. التواصل</h2>
            <p>
              نرسل إشعارات تشغيلية (حضور، مدفوعات، دعوات) عبر المنصة والبريد الإلكتروني، وقد نستخدم
              واتساب للرسائل التشغيلية عند تفعيله. لا رسائل تسويقية دون موافقتك.
            </p>
          </section>
          <section>
            <h2>٩. التعديلات على هذه السياسة</h2>
            <p>سنعلن أي تعديل جوهري داخل المنصة قبل سريانه.</p>
          </section>
        </>
      ) : (
        <>
          <section>
            <h2>1. Data we collect</h2>
            <ul>
              <li>Account data: name, email, phone number, role, and a hashed password.</li>
              <li>Operational data: classes, attendance, grades, subscriptions, payment and wallet records.</li>
              <li>Guardian contact details for minor students (email or phone) for oversight and communication.</li>
              <li>Technical records: sign-in timestamps and audit logs of sensitive operations.</li>
            </ul>
          </section>
          <section>
            <h2>2. Protection of minors — a core rule</h2>
            <ul>
              <li>Any student not verifiably 18+ is automatically treated as a minor.</li>
              <li>A minor's messaging with adults requires a guardian contact channel; an approved linked guardian has read-only visibility into their child's conversations with adults, disclosed to both sides.</li>
              <li>We never sell student data or use it for advertising.</li>
            </ul>
          </section>
          <section>
            <h2>3. Payments</h2>
            <p>
              Card and mobile-wallet payments run on the licensed payment provider's (Paymob)
              secure pages — <strong>we never store card numbers</strong>. We keep the transaction
              record (amount, time, status, reference) for accounting and refunds.
            </p>
          </section>
          <section>
            <h2>4. Who sees your data</h2>
            <ul>
              <li>A center or teacher sees only their own linked students (attendance, grades, payments of their classes).</li>
              <li>A parent sees the children linked to their account by approval.</li>
              <li>Platform staff access data for operations and support; sensitive actions are written to a tamper-proof audit log.</li>
              <li>We share data with third parties only as operational providers (payments, email, hosting) or under legal obligation.</li>
            </ul>
          </section>
          <section>
            <h2>5. Security</h2>
            <ul>
              <li>Encrypted transport (HTTPS); passwords stored as strong one-way hashes.</li>
              <li>Per-center data isolation at the database level; financial records that cannot be edited or deleted.</li>
              <li>Changing your password ends old sessions on all devices.</li>
            </ul>
          </section>
          <section>
            <h2>6. Retention and deletion</h2>
            <ul>
              <li>In-platform deletion is soft deletion: data leaves use while legally required financial and audit records remain.</li>
              <li>You may request correction of your data or deletion of your account, honored subject to legal and accounting obligations.</li>
            </ul>
          </section>
          <section>
            <h2>7. Cookies</h2>
            <p>Essential cookies only — sign-in, language, and theme. No advertising trackers.</p>
          </section>
          <section>
            <h2>8. Communication</h2>
            <p>
              We send operational notifications (attendance, payments, invites) in-platform and by
              email, and may use WhatsApp for operational messages when enabled. No marketing
              messages without your consent.
            </p>
          </section>
          <section>
            <h2>9. Changes to this policy</h2>
            <p>Material changes will be announced in the platform before taking effect.</p>
          </section>
        </>
      )}
    </LegalPage>
  );
}
