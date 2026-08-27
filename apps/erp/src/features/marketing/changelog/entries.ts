import type { Locale } from "@/lib/i18n";

export type ChangelogTag = "feature" | "improvement" | "fix" | "security";

export type ChangelogEntry = {
  date: string;
  tag: ChangelogTag;
  title: Record<Locale, string>;
  body: Record<Locale, string>;
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-08-01",
    tag: "security",
    title: {
      ar: "تسجيل دخول جديد: مصادقة ثنائية وإدارة للأجهزة",
      en: "New sign-in: two-factor authentication and device management",
    },
    body: {
      ar: "بقيت تقدر تشوف كل الأجهزة اللي داخلة على حسابك وتسجّل خروج أي واحد فيها من الإعدادات. والمصادقة الثنائية بقت متاحة لأصحاب السناتر ومطلوبة لحسابات الإدارة. تغيير كلمة السر بقى بينهي كل الجلسات القديمة فورًا.",
      en: "You can now see every device signed in to your account and sign any of them out from settings. Two-factor authentication is available to center owners and required for back-office accounts. Changing a password now ends every older session immediately.",
    },
  },
  {
    date: "2026-08-01",
    tag: "feature",
    title: {
      ar: "السنتر بيسعّر قاعته، والمدرّس بيشوف السعر قبل الحجز",
      en: "Centers price their own halls, and teachers see the rate before booking",
    },
    body: {
      ar: "السنتر بقى يحدد نصيب قاعته لكل طالب حاضر بنفسه، في حدود السعر المعلن من المنصة. والأهم: المدرّس بقى يشوف الرقم ده على كارت القاعة وهو بيقارن، مش بعد التسوية.",
      en: "A center can now set its own hall's per-attending-student rate, within the platform's published ceiling. More importantly, the teacher now sees that number on the hall card while comparing halls — not after settlement.",
    },
  },
  {
    date: "2026-07-27",
    tag: "feature",
    title: {
      ar: "ولي الأمر يدفع حصة ابنه من محفظته",
      en: "Parents can pay for a child's lesson from their own wallet",
    },
    body: {
      ar: "ولي الأمر بقى يقدر يفعّل ويدفع حصة (أو شهر) لأي من أبنائه المرتبطين بحسابه، من محفظته هو. الدفع بيتسجّل باسم اللي دفع، وحساب الحصة ما بيتغيّرش.",
      en: "A parent can now activate and pay for a specific lesson (or a month) for any approved child, out of their own wallet. Who paid is recorded, and the lesson's own calculation is unchanged.",
    },
  },
  {
    date: "2026-07-27",
    tag: "feature",
    title: {
      ar: "ملاحظات الفريق — لوحة مهام داخلية",
      en: "Team notes — an internal to-do board",
    },
    body: {
      ar: "لوحة مهام لفريق السنتر (المالك وطاقم العمل) ولفريق المدرّس (هو ومساعدينه): ملاحظات بحالة مفتوحة/تمّت/مرفوضة، تثبيت، ومين قرأ إيه.",
      en: "A to-do board for a center's team (owner plus staff) and a teacher's team (teacher plus assistants): notes with open/done/declined states, pinning, and who has read what.",
    },
  },
  {
    date: "2026-07-25",
    tag: "improvement",
    title: {
      ar: "الدعوات بقت بالبريد لكل الأدوار",
      en: "Invites are now email-first for every role",
    },
    body: {
      ar: "المدرّسين والمساعدين وطاقم السنتر بقوا يستلموا دعوة بالبريد ويحددوا كلمة سرهم بنفسهم — محدش بقى يكتب كلمة سر لحد تاني. ولو البريد راح في السبام، في لينك تقدر تنسخه وتبعته بإيدك.",
      en: "Teachers, assistants and center staff now receive an email invite and set their own password — nobody types a password for someone else any more. And if the mail lands in spam, there's a copyable link you can hand over yourself.",
    },
  },
  {
    date: "2026-07-25",
    tag: "security",
    title: {
      ar: "قناة تواصل ولي الأمر لحماية القُصّر",
      en: "A guardian channel to protect minors",
    },
    body: {
      ar: "أي طالب ما ثبتش إنه بالغ بيتعامل كقاصر. القاصر اللي مفيش لولي أمره بريد بتتقفل عنده مراسلة البالغين لحد ما يتضاف — وكل حاجة تانية شغالة عادي، والحساب ما بيتوقفش.",
      en: "Any student not shown to be an adult is treated as a minor. A minor with no guardian email has adult messaging locked until one is added — everything else keeps working, and the account is never suspended.",
    },
  },
  {
    date: "2026-07-22",
    tag: "feature",
    title: {
      ar: "مراسلة مرتبطة بالعلاقات + اطّلاع ولي الأمر",
      en: "Relationship-scoped messaging with parent oversight",
    },
    body: {
      ar: "الطلاب وأولياء الأمور بقوا يراسلوا مدرّسينهم مباشرة. وولي الأمر بيقدر يقرأ محادثات ابنه القاصر مع البالغين للقراءة فقط، مع تنبيه دايم للطرفين — مفيش مراقبة خفية.",
      en: "Students and parents now message their own teachers directly. A parent can read their minor child's threads with adults, read-only, with a permanent notice to both sides — no hidden monitoring.",
    },
  },
  {
    date: "2026-07-22",
    tag: "feature",
    title: {
      ar: "محفظة الطالب",
      en: "The student wallet",
    },
    body: {
      ar: "الطالب بقى يقدر يشحن رصيد (أونلاين أو كاش على الكاونتر) ويدفع منه حصصه. الاسترجاع بيرجع للمحفظة، وكل حركة ليها قيد ظاهر.",
      en: "Students can now top up a balance (online or in cash at the counter) and pay for lessons from it. Refunds return to the wallet, and every movement has a visible entry.",
    },
  },
] as const;
