import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDoc, PageFrame } from "@/components/page-frame";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

// The section headings, shared by the headings themselves and the on-page contents list.
const HEADINGS = {
  ar: [
    "١. البيانات التي نجمعها",
    "٢. حماية القُصّر — قاعدة أساسية",
    "٣. المدفوعات",
    "٤. من يرى بياناتك",
    "٥. الأمان",
    "٦. حقوقك في بياناتك — القانون ١٥١ لسنة ٢٠٢٠",
    "٧. ملفات الارتباط (Cookies)",
    "٨. التواصل",
    "٩. التعديلات على هذه السياسة",
  ],
  en: [
    "1. Data we collect",
    "2. Protection of minors — a core rule",
    "3. Payments",
    "4. Who sees your data",
    "5. Security",
    "6. Your rights over your data — Law 151/2020",
    "7. Cookies",
    "8. Communication",
    "9. Changes to this policy",
  ],
};

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const l = getPages(locale).legal;

  return {
    title: `${l.privacyTitle} — ${locale === "ar" ? "لينكتك" : "Linktich"}`,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((loc) => [loc, `/${loc}/privacy`])),
    },
  };
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = getMessages(locale);
  const l = getPages(locale).legal;
  const ar = locale === "ar";
  const headings = HEADINGS[locale];

  return (
    <PageFrame locale={locale} t={t}>
      <LegalDoc
        title={l.privacyTitle}
        updatedLabel={l.updated}
        updated={l.privacyUpdated}
        contentsLabel={l.contents}
        headings={headings}
      >
          {ar ? (
            <>
              <section id="section-1">
                <h2>{headings[0]}</h2>
                <ul>
                  <li>بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، الدور، وكلمة مرور مشفّرة.</li>
                  <li>بيانات تشغيلية: الفصول، الحضور، الدرجات، الاشتراكات، وسجلات المدفوعات والمحافظ.</li>
                  <li>بيانات ولي الأمر/الوصي للطلاب القُصّر (بريد أو هاتف) لأغراض الإشراف والتواصل.</li>
                  <li>سجلات فنية: توقيتات الدخول وسجلات تدقيق للعمليات الحساسة.</li>
                </ul>
              </section>
              <section id="section-2">
                <h2>{headings[1]}</h2>
                <ul>
                  <li>أي طالب لم يثبت بلوغه ١٨ عامًا ببيانات موثّقة يُعامل تلقائيًا كقاصر.</li>
                  <li>
                    مراسلة القاصر للبالغين على المنصة مشروطة بوجود قناة تواصل لولي الأمر، ولوليّ الأمر
                    المرتبط بحساب معتمد اطّلاع للقراءة فقط على محادثات ابنه مع البالغين، مع إعلان ذلك
                    للطرفين.
                  </li>
                  <li>لا نبيع بيانات الطلاب ولا نستخدمها في إعلانات.</li>
                </ul>
              </section>
              <section id="section-3">
                <h2>{headings[2]}</h2>
                <p>
                  الدفع بالبطاقات والمحافظ الإلكترونية يتم عبر مزوّد الدفع المرخّص (Paymob) على صفحاته
                  الآمنة — <strong>لا نخزّن أرقام البطاقات إطلاقًا</strong>. نحتفظ بسجل العملية (المبلغ،
                  الوقت، الحالة، مرجع العملية) لأغراض المحاسبة والاسترداد.
                </p>
              </section>
              <section id="section-4">
                <h2>{headings[3]}</h2>
                <ul>
                  <li>السنتر والمدرّس يريان بيانات طلابهما المرتبطين بهما فقط (حضور، درجات، مدفوعات حصصهم).</li>
                  <li>ولي الأمر يرى بيانات أبنائه المرتبطين بحسابه باعتماد.</li>
                  <li>
                    فريق تشغيل المنصة يصل للبيانات للتشغيل والدعم، وكل عملياته الحساسة مسجلة في سجل
                    تدقيق غير قابل للتعديل.
                  </li>
                  <li>
                    لا نشارك بياناتك مع أطراف ثالثة إلا لمزوّدي خدمات التشغيل (الدفع، البريد،
                    الاستضافة) أو بموجب التزام قانوني.
                  </li>
                </ul>
              </section>
              <section id="section-5">
                <h2>{headings[4]}</h2>
                <ul>
                  <li>الاتصال مشفّر (HTTPS)، وكلمات المرور مخزّنة بتجزئة قوية لا يمكن عكسها.</li>
                  <li>عزل بيانات كل سنتر على مستوى قاعدة البيانات، وسجلات مالية لا تقبل التعديل أو الحذف.</li>
                  <li>تغيير كلمة المرور يُنهي الجلسات القديمة على كل الأجهزة.</li>
                </ul>
              </section>
              <section id="section-6">
                <h2>{headings[5]}</h2>
                <p>
                  هذه الحقوق منفَّذة فعليًا داخل المنصة، من صفحة{" "}
                  <strong>الإعدادات ← بياناتك وحقوقك</strong>، وليست وعدًا بالتواصل معنا.
                </p>
                <h3>الاطّلاع والحصول على نسخة</h3>
                <ul>
                  <li>
                    يمكنك طلب نسخة من بياناتك في أي وقت. نجهّزها كملف واحد ويظهر زر تحميله في نفس
                    الصفحة عند جاهزيته.
                  </li>
                  <li>
                    الملف لا يحتوي كلمة المرور ولا رموز الجلسات ولا مفاتيح التحقق بخطوتين — هذه بيانات
                    اعتماد وليست بيانات شخصية، وتصديرها كان سيحوّل خاصية خصوصية إلى وسيلة اختراق.
                  </li>
                  <li>يُحذف الملف تلقائيًا بعد ٧ أيام من تجهيزه.</li>
                  <li>لولي الأمر المرتبط بحساب معتمد أن يطلب نسخة من بيانات ابنه القاصر.</li>
                </ul>
                <h3>الحذف</h3>
                <ul>
                  <li>
                    تطلب الحذف من نفس الصفحة. الطلب <strong>لا يحذف حسابك في لحظته</strong> — يراجعه
                    فريق المنصة، ويمكنك سحبه قبل المراجعة.
                  </li>
                  <li>
                    حساب الطالب القاصر: الطلب يقدّمه ولي الأمر المرتبط بحسابه، لا الطالب نفسه. وكل
                    طالب لم يثبت بلوغه ١٨ عامًا ببيانات موثّقة يُعامل تلقائيًا كقاصر.
                  </li>
                  <li>
                    عند التنفيذ: تُمحى بياناتك الشخصية نهائيًا — الاسم والبريد ورقم الهاتف وبيانات
                    ولي الأمر وتاريخ الميلاد — ويُعطَّل الحساب وتنتهي كل جلساته فورًا.
                  </li>
                  <li>
                    <strong>ما يبقى، وسبب بقائه:</strong> السجلات المالية والمحاسبية (المدفوعات
                    والإيصالات والتسويات وقيود الدفتر) وسجل التدقيق. القانون المصري يلزمنا بحفظ
                    السجلات المحاسبية، وهذه السجلات غير قابلة للتعديل أو الحذف على مستوى قاعدة
                    البيانات نفسها. تبقى مرتبطة برقم حساب بلا اسم ولا بيانات تواصل — أي أن الدفاتر
                    تظل قابلة للمراجعة دون أن تظل قابلة للنسبة إليك.
                  </li>
                  <li>كل طلب حذف وكل قرار عليه مُسجَّل في سجل تدقيق غير قابل للتعديل.</li>
                </ul>
                <h3>التصحيح</h3>
                <p>
                  يمكنك تعديل بياناتك مباشرة من صفحة الإعدادات، أو مراسلتنا لتصحيح ما لا يمكنك تعديله
                  بنفسك.
                </p>
              </section>
              <section id="section-7">
                <h2>{headings[6]}</h2>
                <p>
                  نستخدم ملفات ارتباط أساسية لتسجيل الدخول وتفضيلات اللغة والمظهر فقط — لا توجد ملفات
                  تتبع إعلانية.
                </p>
              </section>
              <section id="section-8">
                <h2>{headings[7]}</h2>
                <p>
                  نرسل إشعارات تشغيلية (حضور، مدفوعات، دعوات) عبر المنصة والبريد الإلكتروني، وقد نستخدم
                  واتساب للرسائل التشغيلية عند تفعيله. لا رسائل تسويقية دون موافقتك.
                </p>
              </section>
              <section id="section-9">
                <h2>{headings[8]}</h2>
                <p>سنعلن أي تعديل جوهري داخل المنصة قبل سريانه.</p>
              </section>
            </>
          ) : (
            <>
              <section id="section-1">
                <h2>{headings[0]}</h2>
                <ul>
                  <li>Account data: name, email, phone number, role, and a hashed password.</li>
                  <li>Operational data: classes, attendance, grades, subscriptions, payment and wallet records.</li>
                  <li>Guardian contact details for minor students (email or phone) for oversight and communication.</li>
                  <li>Technical records: sign-in timestamps and audit logs of sensitive operations.</li>
                </ul>
              </section>
              <section id="section-2">
                <h2>{headings[1]}</h2>
                <ul>
                  <li>Any student not verifiably 18+ is automatically treated as a minor.</li>
                  <li>
                    A minor&apos;s messaging with adults requires a guardian contact channel; an
                    approved linked guardian has read-only visibility into their child&apos;s
                    conversations with adults, disclosed to both sides.
                  </li>
                  <li>We never sell student data or use it for advertising.</li>
                </ul>
              </section>
              <section id="section-3">
                <h2>{headings[2]}</h2>
                <p>
                  Card and mobile-wallet payments run on the licensed payment provider&apos;s (Paymob)
                  secure pages — <strong>we never store card numbers</strong>. We keep the transaction
                  record (amount, time, status, reference) for accounting and refunds.
                </p>
              </section>
              <section id="section-4">
                <h2>{headings[3]}</h2>
                <ul>
                  <li>A center or teacher sees only their own linked students (attendance, grades, payments of their classes).</li>
                  <li>A parent sees the children linked to their account by approval.</li>
                  <li>
                    Platform staff access data for operations and support; sensitive actions are
                    written to a tamper-proof audit log.
                  </li>
                  <li>
                    We share data with third parties only as operational providers (payments, email,
                    hosting) or under legal obligation.
                  </li>
                </ul>
              </section>
              <section id="section-5">
                <h2>{headings[4]}</h2>
                <ul>
                  <li>Encrypted transport (HTTPS); passwords stored as strong one-way hashes.</li>
                  <li>Per-center data isolation at the database level; financial records that cannot be edited or deleted.</li>
                  <li>Changing your password ends old sessions on all devices.</li>
                </ul>
              </section>
              <section id="section-6">
                <h2>{headings[5]}</h2>
                <p>
                  These rights are implemented in the product, under{" "}
                  <strong>Settings → Your data and rights</strong>. They are not a promise to contact
                  us.
                </p>
                <h3>Access and a copy</h3>
                <ul>
                  <li>
                    You can request a copy of your data at any time. We prepare it as a single file
                    and the download button appears on that page as soon as it is ready.
                  </li>
                  <li>
                    The file contains no password, no session tokens and no two-factor secrets — those
                    are credentials rather than personal data, and exporting them would turn a privacy
                    feature into an account-takeover tool.
                  </li>
                  <li>The file is deleted automatically 7 days after it is prepared.</li>
                  <li>A guardian with an approved link may request a copy of their minor child&apos;s data.</li>
                </ul>
                <h3>Deletion</h3>
                <ul>
                  <li>
                    You request deletion from the same page. The request{" "}
                    <strong>does not delete your account at that moment</strong> — the platform team
                    reviews it, and you may withdraw it before review.
                  </li>
                  <li>
                    For a minor student&apos;s account, the request is made by the guardian linked to
                    it, not by the student. Any student not verifiably 18+ is treated as a minor.
                  </li>
                  <li>
                    On execution: your personal details are permanently erased — name, email, phone,
                    guardian contact, date of birth — the account is disabled and all its sessions end
                    immediately.
                  </li>
                  <li>
                    <strong>What remains, and why:</strong> financial and accounting records
                    (payments, receipts, settlements, ledger entries) and the audit log. Egyptian law
                    requires us to retain accounting records, and those records cannot be edited or
                    deleted at the database level in the first place. They remain attached to an
                    account id carrying no name and no contact details — the books stay auditable
                    without staying attributable to you.
                  </li>
                  <li>Every deletion request, and every decision on one, is written to a tamper-proof audit log.</li>
                </ul>
                <h3>Correction</h3>
                <p>
                  You can edit your details directly in Settings, or contact us to correct anything
                  you cannot change yourself.
                </p>
              </section>
              <section id="section-7">
                <h2>{headings[6]}</h2>
                <p>Essential cookies only — sign-in, language, and theme. No advertising trackers.</p>
              </section>
              <section id="section-8">
                <h2>{headings[7]}</h2>
                <p>
                  We send operational notifications (attendance, payments, invites) in-platform and by
                  email, and may use WhatsApp for operational messages when enabled. No marketing
                  messages without your consent.
                </p>
              </section>
              <section id="section-9">
                <h2>{headings[8]}</h2>
                <p>Material changes will be announced in the platform before taking effect.</p>
              </section>
            </>
          )}
      </LegalDoc>
    </PageFrame>
  );
}
