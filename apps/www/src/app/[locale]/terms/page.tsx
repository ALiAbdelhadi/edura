import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LegalDoc, PageFrame } from "@/components/page-frame";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

// The section headings, shared by the headings themselves and the on-page contents list.
const HEADINGS = {
  ar: [
    "١. عن المنصة",
    "٢. الحسابات والأدوار",
    "٣. دور المنصة",
    "٤. المدفوعات",
    "٥. الاستخدام المقبول",
    "٦. المحتوى والبيانات",
    "٧. حدود المسؤولية",
    "٨. التعديلات",
    "٩. القانون الواجب التطبيق",
  ],
  en: [
    "1. About the platform",
    "2. Accounts and roles",
    "3. The platform's role",
    "4. Payments",
    "5. Acceptable use",
    "6. Content and data",
    "7. Limitation of liability",
    "8. Changes",
    "9. Governing law",
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
    title: `${l.termsTitle} — ${locale === "ar" ? "لينكتك" : "Linktich"}`,
    alternates: {
      languages: Object.fromEntries(LOCALES.map((loc) => [loc, `/${loc}/terms`])),
    },
  };
}

export default async function TermsPage({
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
        title={l.termsTitle}
        updatedLabel={l.updated}
        updated={l.termsUpdated}
        contentsLabel={l.contents}
        headings={headings}
      >
          {ar ? (
            <>
              <section id="section-1">
                <h2>{headings[0]}</h2>
                <p>
                  «لينكتك» (Linktich) منصة إلكترونية تربط السناتر التعليمية والمدرّسين بالطلاب وأولياء
                  الأمور في مصر: إدارة الفصول والحصص، تسجيل الحضور، الاشتراكات والمدفوعات، المحافظ،
                  والتواصل. باستخدامك للمنصة فأنت توافق على هذه الشروط.
                </p>
              </section>
              <section id="section-2">
                <h2>{headings[1]}</h2>
                <ul>
                  <li>لكل مستخدم دور محدد (سنتر، مدرّس، مساعد، ولي أمر، طالب) بصلاحيات مختلفة.</li>
                  <li>أنت مسؤول عن سرية بيانات الدخول وعن كل نشاط يتم من حسابك.</li>
                  <li>يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ومحدّثة.</li>
                  <li>حسابات الطلاب دون ١٨ عامًا تخضع لإشراف ولي الأمر (انظر سياسة الخصوصية).</li>
                </ul>
              </section>
              <section id="section-3">
                <h2>{headings[2]}</h2>
                <p>
                  «لينكتك» وسيط تقني: الحصص والخدمات التعليمية نفسها يقدمها السنتر أو المدرّس، وهم
                  المسؤولون عن جودتها ومواعيدها ومحتواها. المنصة توفر أدوات الإدارة والتحصيل والمتابعة.
                </p>
              </section>
              <section id="section-4">
                <h2>{headings[3]}</h2>
                <ul>
                  <li>الدفع الإلكتروني يتم عبر مزوّد دفع مرخّص (Paymob) — المنصة لا تخزّن بيانات البطاقات.</li>
                  <li>يمكن الدفع نقدًا في السنتر ويسجَّل على المنصة.</li>
                  <li>
                    أرصدة المحافظ (طالب/ولي أمر) أرصدة مدفوعة مقدمًا تُستخدم داخل المنصة، والاسترداد
                    وفق سياسة الاسترداد المعلنة للحصة أو الاشتراك.
                  </li>
                  <li>سجلات الحضور والتسويات على المنصة هي المرجع في احتساب المستحقات.</li>
                </ul>
              </section>
              <section id="section-5">
                <h2>{headings[4]}</h2>
                <ul>
                  <li>يُحظر أي استخدام مخالف للقانون أو منتهك لحقوق الغير أو مسيء للقُصّر.</li>
                  <li>يُحظر محاولة الوصول لبيانات غير مصرح بها أو تعطيل عمل المنصة.</li>
                  <li>يحق للمنصة تعليق أو إنهاء الحسابات المخالفة، مع الحفاظ على السجلات المالية المطلوبة قانونًا.</li>
                </ul>
              </section>
              <section id="section-6">
                <h2>{headings[5]}</h2>
                <p>
                  ما يرفعه السنتر أو المدرّس من مواد يظل ملكًا له، ويمنح المنصة ترخيصًا لعرضه
                  للمستفيدين المصرح لهم فقط. بيانات التشغيل (حضور، درجات، مدفوعات) تُدار وفق سياسة
                  الخصوصية.
                </p>
              </section>
              <section id="section-7">
                <h2>{headings[6]}</h2>
                <p>
                  تُقدَّم المنصة «كما هي». لا تضمن «لينكتك» خلوّها من الانقطاع أو الخطأ، ولا تتحمل مسؤولية
                  الخدمات التعليمية المقدمة من السناتر والمدرّسين. وتقتصر مسؤوليتها تجاهك على
                  الأضرار المباشرة الناتجة عن خطأ ثابت منها، في أضيق الحدود التي يسمح بها القانون المصري.
                </p>
              </section>
              <section id="section-8">
                <h2>{headings[7]}</h2>
                <p>
                  قد نعدّل هذه الشروط، وسنعلن التعديلات الجوهرية داخل المنصة. استمرارك في الاستخدام بعد
                  الإعلان يعني الموافقة.
                </p>
              </section>
              <section id="section-9">
                <h2>{headings[8]}</h2>
                <p>تخضع هذه الشروط لقوانين جمهورية مصر العربية، وتختص محاكمها بأي نزاع.</p>
              </section>
            </>
          ) : (
            <>
              <section id="section-1">
                <h2>{headings[0]}</h2>
                <p>
                  Linktich is an online platform connecting teaching centers and teachers with students
                  and parents in Egypt: class management, attendance, subscriptions and payments,
                  wallets, and messaging. By using it you agree to these terms.
                </p>
              </section>
              <section id="section-2">
                <h2>{headings[1]}</h2>
                <ul>
                  <li>Each user has a role (center, teacher, assistant, parent, student) with distinct permissions.</li>
                  <li>You are responsible for your credentials and all activity on your account.</li>
                  <li>Registration data must be accurate and kept up to date.</li>
                  <li>Accounts of students under 18 are subject to guardian oversight (see the Privacy Policy).</li>
                </ul>
              </section>
              <section id="section-3">
                <h2>{headings[2]}</h2>
                <p>
                  Linktich is a technical intermediary: lessons and educational services are provided by
                  the center or teacher, who are responsible for their quality, schedule, and content.
                  The platform provides the management, collection, and follow-up tools.
                </p>
              </section>
              <section id="section-4">
                <h2>{headings[3]}</h2>
                <ul>
                  <li>Online payment runs through a licensed payment provider (Paymob) — the platform never stores card data.</li>
                  <li>Cash payment at the center is supported and recorded on the platform.</li>
                  <li>
                    Wallet balances (student/parent) are prepaid balances used within the platform;
                    refunds follow the published refund policy of the lesson or subscription.
                  </li>
                  <li>The platform&apos;s attendance and settlement records are the reference for computing dues.</li>
                </ul>
              </section>
              <section id="section-5">
                <h2>{headings[4]}</h2>
                <ul>
                  <li>Any unlawful use, infringement of others&apos; rights, or abuse involving minors is prohibited.</li>
                  <li>Attempting unauthorized access or disrupting the service is prohibited.</li>
                  <li>Violating accounts may be suspended or terminated, with legally required financial records retained.</li>
                </ul>
              </section>
              <section id="section-6">
                <h2>{headings[5]}</h2>
                <p>
                  Materials uploaded by a center or teacher remain theirs, with a license for the
                  platform to display them to authorized recipients only. Operational data
                  (attendance, grades, payments) is handled per the Privacy Policy.
                </p>
              </section>
              <section id="section-7">
                <h2>{headings[6]}</h2>
                <p>
                  The platform is provided &quot;as is&quot;. Linktich does not guarantee uninterrupted
                  or error-free operation and is not liable for the educational services provided by
                  centers and teachers. Its liability to you is limited to direct damage caused by
                  its own proven fault, to the narrowest extent permitted by Egyptian law.
                </p>
              </section>
              <section id="section-8">
                <h2>{headings[7]}</h2>
                <p>
                  We may amend these terms; material changes will be announced in the platform.
                  Continued use after the announcement constitutes acceptance.
                </p>
              </section>
              <section id="section-9">
                <h2>{headings[8]}</h2>
                <p>
                  These terms are governed by the laws of the Arab Republic of Egypt, and its courts
                  have jurisdiction over any dispute.
                </p>
              </section>
            </>
          )}
      </LegalDoc>
    </PageFrame>
  );
}
