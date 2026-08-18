import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Eyebrow } from "@repo/ui/components/eyebrow";

import { PageFrame } from "@/components/page-frame";
import { LOCALES, isLocale } from "@/i18n/config";
import { getMessages } from "@/i18n/messages";
import { getPages } from "@/i18n/pages";

/**
 * DRAFT terms of service — the copy is the product app's own, grounded in what
 * the product actually does (roles, commission-based money engine, wallets,
 * attendance, minors). Needs review by qualified Egyptian counsel before the
 * official launch; the factual claims about how the platform works are
 * accurate today.
 */

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
    title: `${l.termsTitle} — Edura`,
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

  return (
    <PageFrame locale={locale} t={t}>
      <section className="mx-auto w-full max-w-[87.5rem] px-6 pt-14 pb-10 md:px-10 lg:pt-20">
        <Eyebrow locale={locale} tone="gold">
          {t.footer.legal}
        </Eyebrow>
        <h1 className="display mt-5 max-w-[18ch] text-[clamp(2rem,1.3rem+2.8vw,3.25rem)] leading-[1.15] text-ink">
          {l.termsTitle}
        </h1>
        <p className="mt-4 text-[0.8125rem] text-ink-3">
          {l.updated}: {l.termsUpdated}
        </p>
      </section>

      <div className="legal-copy mx-auto w-full max-w-[87.5rem] px-6 pb-20 md:px-10">
        {ar ? (
          <>
            <section>
              <h2>١. عن المنصة</h2>
              <p>
                «إدورا» (Edura) منصة إلكترونية تربط السناتر التعليمية والمدرّسين بالطلاب وأولياء
                الأمور في مصر: إدارة الفصول والحصص، تسجيل الحضور، الاشتراكات والمدفوعات، المحافظ،
                والتواصل. باستخدامك للمنصة فأنت توافق على هذه الشروط.
              </p>
            </section>
            <section>
              <h2>٢. الحسابات والأدوار</h2>
              <ul>
                <li>لكل مستخدم دور محدد (سنتر، مدرّس، مساعد، ولي أمر، طالب) بصلاحيات مختلفة.</li>
                <li>أنت مسؤول عن سرية بيانات الدخول وعن كل نشاط يتم من حسابك.</li>
                <li>يجب أن تكون البيانات المقدمة عند التسجيل صحيحة ومحدّثة.</li>
                <li>حسابات الطلاب دون ١٨ عامًا تخضع لإشراف ولي الأمر (انظر سياسة الخصوصية).</li>
              </ul>
            </section>
            <section>
              <h2>٣. دور المنصة</h2>
              <p>
                إدورا وسيط تقني: الحصص والخدمات التعليمية نفسها يقدمها السنتر أو المدرّس، وهم
                المسؤولون عن جودتها ومواعيدها ومحتواها. المنصة توفر أدوات الإدارة والتحصيل والمتابعة.
              </p>
            </section>
            <section>
              <h2>٤. المدفوعات والعمولات</h2>
              <ul>
                <li>الدفع الإلكتروني يتم عبر مزوّد دفع مرخّص (Paymob) — المنصة لا تخزّن بيانات البطاقات.</li>
                <li>يمكن الدفع نقدًا في السنتر ويسجَّل على المنصة.</li>
                <li>تخصم المنصة عمولة و/أو رسوم خدمة معلنة من التسويات وفق الأسعار السارية وقت إنشاء الفصل.</li>
                <li>
                  أرصدة المحافظ (طالب/ولي أمر) أرصدة مدفوعة مقدمًا تُستخدم داخل المنصة، والاسترداد
                  وفق سياسة الاسترداد المعلنة للحصة أو الاشتراك.
                </li>
                <li>سجلات الحضور والتسويات على المنصة هي المرجع في احتساب المستحقات.</li>
              </ul>
            </section>
            <section>
              <h2>٥. الاستخدام المقبول</h2>
              <ul>
                <li>يُحظر أي استخدام مخالف للقانون أو منتهك لحقوق الغير أو مسيء للقُصّر.</li>
                <li>يُحظر محاولة الوصول لبيانات غير مصرح بها أو تعطيل عمل المنصة.</li>
                <li>يحق للمنصة تعليق أو إنهاء الحسابات المخالفة، مع الحفاظ على السجلات المالية المطلوبة قانونًا.</li>
              </ul>
            </section>
            <section>
              <h2>٦. المحتوى والبيانات</h2>
              <p>
                ما يرفعه السنتر أو المدرّس من مواد يظل ملكًا له، ويمنح المنصة ترخيصًا لعرضه
                للمستفيدين المصرح لهم فقط. بيانات التشغيل (حضور، درجات، مدفوعات) تُدار وفق سياسة
                الخصوصية.
              </p>
            </section>
            <section>
              <h2>٧. حدود المسؤولية</h2>
              <p>
                تُقدَّم المنصة «كما هي». لا تضمن إدورا خلوّها من الانقطاع أو الخطأ، ولا تتحمل مسؤولية
                الخدمات التعليمية المقدمة من السناتر والمدرّسين. لا يتجاوز أقصى التزام للمنصة تجاهك
                قيمة الرسوم التي حصّلتها منك عن الثلاثة أشهر السابقة للمطالبة.
              </p>
            </section>
            <section>
              <h2>٨. التعديلات</h2>
              <p>
                قد نعدّل هذه الشروط، وسنعلن التعديلات الجوهرية داخل المنصة. استمرارك في الاستخدام بعد
                الإعلان يعني الموافقة.
              </p>
            </section>
            <section>
              <h2>٩. القانون الواجب التطبيق</h2>
              <p>تخضع هذه الشروط لقوانين جمهورية مصر العربية، وتختص محاكمها بأي نزاع.</p>
            </section>
          </>
        ) : (
          <>
            <section>
              <h2>1. About the platform</h2>
              <p>
                Edura is an online platform connecting teaching centers and teachers with students
                and parents in Egypt: class management, attendance, subscriptions and payments,
                wallets, and messaging. By using it you agree to these terms.
              </p>
            </section>
            <section>
              <h2>2. Accounts and roles</h2>
              <ul>
                <li>Each user has a role (center, teacher, assistant, parent, student) with distinct permissions.</li>
                <li>You are responsible for your credentials and all activity on your account.</li>
                <li>Registration data must be accurate and kept up to date.</li>
                <li>Accounts of students under 18 are subject to guardian oversight (see the Privacy Policy).</li>
              </ul>
            </section>
            <section>
              <h2>3. The platform&apos;s role</h2>
              <p>
                Edura is a technical intermediary: lessons and educational services are provided by
                the center or teacher, who are responsible for their quality, schedule, and content.
                The platform provides the management, collection, and follow-up tools.
              </p>
            </section>
            <section>
              <h2>4. Payments and commissions</h2>
              <ul>
                <li>Online payment runs through a licensed payment provider (Paymob) — the platform never stores card data.</li>
                <li>Cash payment at the center is supported and recorded on the platform.</li>
                <li>The platform deducts published commissions/service fees from settlements, at the rates in force when a class was created.</li>
                <li>
                  Wallet balances (student/parent) are prepaid balances used within the platform;
                  refunds follow the published refund policy of the lesson or subscription.
                </li>
                <li>The platform&apos;s attendance and settlement records are the reference for computing dues.</li>
              </ul>
            </section>
            <section>
              <h2>5. Acceptable use</h2>
              <ul>
                <li>Any unlawful use, infringement of others&apos; rights, or abuse involving minors is prohibited.</li>
                <li>Attempting unauthorized access or disrupting the service is prohibited.</li>
                <li>Violating accounts may be suspended or terminated, with legally required financial records retained.</li>
              </ul>
            </section>
            <section>
              <h2>6. Content and data</h2>
              <p>
                Materials uploaded by a center or teacher remain theirs, with a license for the
                platform to display them to authorized recipients only. Operational data
                (attendance, grades, payments) is handled per the Privacy Policy.
              </p>
            </section>
            <section>
              <h2>7. Limitation of liability</h2>
              <p>
                The platform is provided &quot;as is&quot;. Edura does not guarantee uninterrupted
                or error-free operation and is not liable for the educational services provided by
                centers and teachers. The platform&apos;s maximum liability to you shall not exceed
                the fees it collected from you in the three months preceding the claim.
              </p>
            </section>
            <section>
              <h2>8. Changes</h2>
              <p>
                We may amend these terms; material changes will be announced in the platform.
                Continued use after the announcement constitutes acceptance.
              </p>
            </section>
            <section>
              <h2>9. Governing law</h2>
              <p>
                These terms are governed by the laws of the Arab Republic of Egypt, and its courts
                have jurisdiction over any dispute.
              </p>
            </section>
          </>
        )}
      </div>
    </PageFrame>
  );
}
