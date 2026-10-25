import type { Locale } from "./config";
import type { MediaKey } from "@/media/manifest";

export const ROLE_SLUGS = ["student", "parent"] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export function isRoleSlug(value: string): value is RoleSlug {
  return (ROLE_SLUGS as readonly string[]).includes(value);
}

type Capability = {
  name: string;
  detail: string;
};

type Group = {
  title: string;
  lede: string;
  shot: MediaKey | null;
  capabilities: Capability[];
};

type RolePage = {
  // Nav / footer label ("For parents").
  label: string;
  // The role as a noun, used in the page title ("Parents — Linktich").
  name: string;
  headline: string;
  lede: string;
  hero: MediaKey;
  heroAlt: string;
  groups: Group[];
  guarantees: { title: string; detail: string }[];
  ctaTitle: string;
  ctaBody: string;
  ctaPrimary: string;
};

const ar: Record<RoleSlug, RolePage> = {
  parent: {
    label: "لأولياء الأمور",
    name: "أولياء الأمور",
    headline: "تعرف ابنك حضر ولا لأ.",
    lede: "الحضور والدرجات أول بأول، تدفع الحصة أو الشهر من محفظتك، وتطّلع على محادثات ابنك مع الكبار للقراءة بس.",
    hero: "roleParent",
    heroAlt: "ولي الأمر بيدفع حصة أو شهر لابنه من محفظته هو.",
    groups: [
      {
        title: "الأبناء",
        lede: "كل أولادك في حساب واحد.",
        shot: "parentChildren",
        capabilities: [
          { name: "الأبناء", detail: "أكتر من ابن في حساب واحد، وكل شاشة بتتفلتر على اللي اخترته." },
          { name: "الحضور", detail: "حضر ولا لأ، وإمتى، وفي أنهي حصة." },
          { name: "التقدم", detail: "الدرجات لكل مادة، ومقارنة على مدار الترم." },
          {
            name: "سلامة الأبناء",
            detail: "محادثات ابنك مع الكبار للقراءة بس. مش بتغيّر علامات القراءة، والطرفين عارفين إنك مطّلع.",
          },
          { name: "الرسائل", detail: "تسأل المدرّس أو السنتر من جوّه النظام." },
        ],
      },
      {
        title: "الفلوس",
        lede: "ادفع الحصة من محفظة ولي الأمر.",
        shot: "parentPay",
        capabilities: [
          { name: "الرسوم", detail: "اللي اتدفع واللي مستحق، بإيصالات." },
          {
            name: "ادفع حصة",
            detail: "فعّل حصة أو شهر لابنك من محفظتك. الدفعة بتتسجّل باسم ابنك، وإنت متسجّل إنك اللي دفعت.",
          },
          { name: "محفظتي", detail: "رصيدك إنت، منفصل عن محفظة ابنك." },
          { name: "الاشتراكات", detail: "شهري أو بالحصة، وإنت اللي بتختار وقت الدفع. مفيش خصم تلقائي." },
        ],
      },
    ],
    guarantees: [
      {
        title: "محفظتك مش محفظة ابنك",
        detail: "بتدفع من فلوسك، مش من رصيده. والنظام بيرفض العكس.",
      },
      {
        title: "الاطّلاع للقراءة بس",
        detail: "مفيش أي طريقة تكتب بدل ابنك. بتشوف محادثاته مع الكبار بس، وبربط الطرفين موافقين عليه.",
      },
      {
        title: "ابنك قاصر لحد ما يثبت العكس",
        detail: "ابنك بيتعامل كقاصر إلا لو تاريخ ميلاده موجود ومتأكَّد منه وسنّه ١٨ أو أكتر. غير كده، مراسلته مع الكبار مقفولة لحد ما يتضاف إيميل ولي أمر.",
      },
    ],
    ctaTitle: "اربط حساب ابنك.",
    ctaBody: "التسجيل مجاني، والربط بموافقة الطرفين.",
    ctaPrimary: "سجّل كولي أمر",
  },

  student: {
    label: "للطلبة",
    name: "الطلبة",
    headline: "موادك وجدولك، كل حاجة في مكانها.",
    lede: "بتختار سنتك وشعبتك مرة واحدة، وموادك بتظهر لوحدها. الجدول والحضور والدرجات والمحفظة والكارنيه، في مكان واحد.",
    hero: "roleStudent",
    heroAlt: "مواد الطالب حسب سنته وشعبته، وجدوله.",
    groups: [
      {
        title: "الدراسة",
        lede: "عندك إيه، وإمتى، وفين.",
        shot: "studentLearn",
        capabilities: [
          {
            name: "المواد الدراسية",
            detail: "مواد شعبتك بتظهر لوحدها، وفيه بحث منفصل لو عايز تشوف باقي المواد.",
          },
          { name: "الجدول", detail: "حصص الأسبوع، بالقاعة والميعاد." },
          { name: "الحضور", detail: "حضرت كام، وغبت كام." },
          { name: "الدرجات", detail: "درجاتك أول بأول." },
          { name: "الملفات التعليمية", detail: "ملفات المدرّس لمجموعاتك." },
        ],
      },
      {
        title: "الحساب",
        lede: "كارنيهك على موبايلك.",
        shot: "studentCard",
        capabilities: [
          {
            name: "الكارنيه",
            detail: "كود من تمن خانات وQR موقّع، بيتطبع أو يتبعت واتساب. الكود ده اللي بيتقرا على الكاونتر.",
          },
          { name: "رمز العائلة", detail: "اربط ولي أمرك بموافقة الطرفين." },
          { name: "الرسائل", detail: "تسأل مدرّسك من جوّه النظام. ولو إنت قاصر، ولي أمرك يقدر يطّلع." },
        ],
      },
      {
        title: "الفلوس",
        lede: "اشحن، وادفع من رصيدك.",
        shot: null,
        capabilities: [
          { name: "المحفظة", detail: "اشحن أونلاين أو كاش من الكاونتر، وادفع من الرصيد." },
          { name: "الاشتراكات", detail: "إيه اللي شغّال، وإيه اللي قرّب يخلص." },
        ],
      },
    ],
    guarantees: [
      {
        title: "كودك ما فيهوش أي بيانات عنك",
        detail: "مش مأخوذ من اسمك ولا تاريخ ميلادك ولا تليفونك. وفيه خانة تحقق بتمسك أي حرف غلط أو حرفين متبدّلين، عشان ما تتحسبش مكان زميلك.",
      },
      {
        title: "الكارنيه الضايع بيتلغي",
        detail: "الـQR موقّع ومربوط بنسخة. أول ما تبلّغ، كل الكروت المطبوعة قبل كده بتبطّل تشتغل.",
      },
      {
        title: "كل دفعة بإيصال",
        detail: "كل دفعة ليها إيصال برقم، وكل حصة ليها سطر. تقدر تراجعهم في أي وقت.",
      },
    ],
    ctaTitle: "ابدأ بسنتك وشعبتك.",
    ctaBody: "خطوة واحدة، وموادك بتظهر بعدها.",
    ctaPrimary: "سجّل كطالب",
  },


};

const en: Record<RoleSlug, RolePage> = {
  parent: {
    label: "For parents",
    name: "Parents",
    headline: "Know whether your child showed up.",
    lede: "Attendance and grades as they happen, pay for a class or a month from your own wallet, and read your child's threads with adults.",
    hero: "roleParent",
    heroAlt: "A parent pays for a class or a month for their child from their own wallet.",
    groups: [
      {
        title: "Children",
        lede: "All your children on one account.",
        shot: "parentChildren",
        capabilities: [
          { name: "Children", detail: "More than one child on one account, and every screen filters to the one you picked." },
          { name: "Attendance", detail: "Present or not, when, and in which class." },
          { name: "Progress", detail: "Marks per subject, compared across the term." },
          {
            name: "Child safety",
            detail: "Your child's threads with adults, read-only. It doesn't change read receipts, and both sides know you can see it.",
          },
          { name: "Messages", detail: "Ask the teacher or the center inside the system." },
        ],
      },
      {
        title: "Money",
        lede: "Pay for the class from the parent's wallet.",
        shot: "parentPay",
        capabilities: [
          { name: "Fees", detail: "What's paid and what's due, with receipts." },
          {
            name: "Pay for a class",
            detail: "Activate a class or a month for your child from your wallet. The payment is recorded in your child's name, with you as the payer.",
          },
          { name: "My wallet", detail: "Your own balance, separate from your child's wallet." },
          { name: "Subscriptions", detail: "Monthly or per class, chosen when you pay. Nothing is charged automatically." },
        ],
      },
    ],
    guarantees: [
      {
        title: "Your wallet isn't your child's wallet",
        detail: "You pay from your money, not their balance. The system refuses the reverse.",
      },
      {
        title: "Read-only means read-only",
        detail: "There's no way to write as your child. You see their threads with adults only, on a link both sides approved.",
      },
      {
        title: "A minor until proven otherwise",
        detail: "Your child is treated as a minor unless a date of birth is on file, verified, and puts them at 18 or over. Until then, messaging with adults stays locked until a guardian email is added.",
      },
    ],
    ctaTitle: "Link your child's account.",
    ctaBody: "Registration is free, and linking needs both sides to agree.",
    ctaPrimary: "Register as a parent",
  },

  student: {
    label: "For students",
    name: "Students",
    headline: "Your subjects and schedule, right where they belong.",
    lede: "Pick your year and track once, and your subjects show up on their own. Schedule, attendance, grades, wallet and ID card, in one place.",
    hero: "roleStudent",
    heroAlt: "The student's subjects for their year and track, and their schedule.",
    groups: [
      {
        title: "Studying",
        lede: "What you have, when, and where.",
        shot: "studentLearn",
        capabilities: [
          {
            name: "Subjects",
            detail: "Your track's subjects show up on their own, with a separate search if you want to see the rest.",
          },
          { name: "Schedule", detail: "This week's classes, with the hall and time." },
          { name: "Attendance", detail: "How many you attended, how many you missed." },
          { name: "Grades", detail: "Your marks as they're entered." },
          { name: "Materials", detail: "Your teacher's files for your groups." },
        ],
      },
      {
        title: "Account",
        lede: "Your ID card on your phone.",
        shot: "studentCard",
        capabilities: [
          {
            name: "ID card",
            detail: "An eight-character code and a signed QR, printed or sent on WhatsApp. That code is what the counter reads.",
          },
          { name: "Family code", detail: "Link your parent, with both sides agreeing." },
          { name: "Messages", detail: "Ask your teacher inside the system. If you're a minor, your parent can read along." },
        ],
      },
      {
        title: "Money",
        lede: "Top up, and pay from your balance.",
        shot: null,
        capabilities: [
          { name: "Wallet", detail: "Top up online or in cash at the counter, and pay from the balance." },
          { name: "Subscriptions", detail: "What's active, and what's about to run out." },
        ],
      },
    ],
    guarantees: [
      {
        title: "Your code says nothing about you",
        detail: "It isn't made from your name, birth date or phone. A check character catches any single wrong character or two swapped ones, so you're never marked present for a classmate.",
      },
      {
        title: "A lost card can be cancelled",
        detail: "The QR is signed and versioned. The moment you report it, every card printed before stops working.",
      },
      {
        title: "Every payment has a receipt",
        detail: "Every payment has a numbered receipt and every class has a line. Check them whenever you like.",
      },
    ],
    ctaTitle: "Start with your year and track.",
    ctaBody: "One step, and your subjects show up after it.",
    ctaPrimary: "Register as a student",
  },


};

const ROLE_PAGES: Record<Locale, Record<RoleSlug, RolePage>> = { ar, en };

// Labels shared by every role page.
const ROLE_UI: Record<
  Locale,
  { brand: string; guaranteesTitle: string; question: string; others: string }
> = {
  ar: {
    brand: "لينكتك",
    guaranteesTitle: "مضمونة في النظام نفسه.",
    question: "عندك سؤال؟",
    others: "والحساب التاني",
  },
  en: {
    brand: "Linktich",
    guaranteesTitle: "Built into the system itself.",
    question: "Got a question?",
    others: "And the other account",
  },
};

export function getRoleUi(locale: Locale) {
  return ROLE_UI[locale];
}

export function getRolePage(locale: Locale, slug: RoleSlug): RolePage {
  return ROLE_PAGES[locale][slug];
}

export type { RolePage, Group, Capability };
