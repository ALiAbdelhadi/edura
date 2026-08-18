import type { Locale } from "./config";
import type { MediaKey } from "@/media/manifest";

/**
 * THE ROLE PAGES — one per audience, and every capability on them is REAL.
 *
 * The feature list is not invented copy. It is the actual route inventory of
 * `apps/erp`, read off the five portal layouts: 19 destinations for the
 * center, 15 for the teacher, 14 for the student, 12 for the parent, 12 for
 * the assistant. The
 * groups are the portal sidebars' own taxonomy (`@teach`, `@counter`,
 * `@money`, `@children`, …) and the capability names are the sidebar's own
 * words in each language.
 *
 * That is the point: a center owner reads this page, signs up, and finds the
 * same nouns in the same groups. A marketing page that renames the product's
 * own screens teaches a vocabulary the product then contradicts.
 *
 * WHAT IS DELIBERATELY NOT HERE: prices, customer names, counts of centers or
 * students, and any claim about performance. None of those are facts I have.
 */

export const ROLE_SLUGS = ["center", "teacher", "parent", "student", "assistant"] as const;
export type RoleSlug = (typeof ROLE_SLUGS)[number];

export function isRoleSlug(value: string): value is RoleSlug {
  return (ROLE_SLUGS as readonly string[]).includes(value);
}

type Capability = {
  /** The sidebar's own label for this destination, in this language. */
  name: string;
  /** What it does, in one line, from the reader's side of the screen. */
  detail: string;
};

type Group = {
  /** The portal sidebar's group heading. */
  label: string;
  /** Reserved imagery for this group. `null` where a still adds nothing. */
  shot: MediaKey | null;
  capabilities: Capability[];
};

type RolePage = {
  /** The eyebrow: who this page is for. */
  label: string;
  headline: string;
  /** The question this role opens the product to answer. */
  question: string;
  lede: string;
  hero: MediaKey;
  groups: Group[];
  /** Three guarantees that matter to THIS role specifically. */
  guarantees: { title: string; detail: string }[];
  ctaTitle: string;
  ctaBody: string;
  ctaPrimary: string;
};

const ar: Record<RoleSlug, RolePage> = {
  center: {
    label: "للسناتر",
    headline: "سنترك كله في دفتر واحد.",
    question: "قبضت كام النهاردة، ومين لسه عليه؟",
    lede: "من الكاونتر لحد كشف الأرباح: تسجيل الحضور، تحصيل الكاش، القاعات والمواعيد، موظفين بصلاحيات محدودة، ومدرّسين بره النظام بيتسجّلوا يدويًا وبيظهروا في نفس التقارير مع الباقي.",
    hero: "roleCenter",
    groups: [
      {
        label: "الكاونتر",
        shot: "centerCounter",
        capabilities: [
          {
            name: "الكاونتر",
            detail: "الحصة الشغالة دلوقتي مختارة قدامك. دوّر بالاسم أو الكود أو اقرا الكارنيه، خد الكاش، وسجّل الحضور — في خطوة واحدة.",
          },
          {
            name: "الطلاب",
            detail: "كشف طلبة السنتر كله، بحث وفلترة، وتسجيل طالب جديد على الكاونتر من غير ما يكون معاه موبايل.",
          },
          {
            name: "طلبات التسجيل",
            detail: "الطلبات اللي جاية من الأهالي والطلبة، بقبول أو رفض بسبب مكتوب.",
          },
        ],
      },
      {
        label: "التشغيل",
        shot: "centerOps",
        capabilities: [
          { name: "المدرّسون", detail: "مين بيدرّس عندك، وبأي شروط، وإيه نصيبه من كل حصة." },
          {
            name: "مدرّسون بره النظام",
            detail: "المدرّس اللي رافض يدخل على المنصة بتسجّله يدويًا: مجموعاته وحضوره ودرجاته وفلوسه، وبيظهر في نفس التقارير مع الباقي. وفيه تقرير بيقولك إيه الناقص.",
          },
          { name: "الفصول", detail: "المجموعات وأسعارها وخطط الدفع اللي مفتوحة فيها." },
          { name: "الجدول", detail: "جدول الأسبوع لكل قاعة ومدرّس، والتعارضات بتتمنع قبل ما تحصل." },
          {
            name: "القاعات",
            detail: "كل قاعة وسعرها: نسبة على الحصة، أو تعريفة لكل طالب حاضر — وأنت بتحدد تعريفة قاعاتك بنفسك في حدود السقف المنشور.",
          },
        ],
      },
      {
        label: "الفلوس",
        shot: "centerMoney",
        capabilities: [
          { name: "الرسوم", detail: "كل ما اتحصّل، كاش أو أونلاين، بإيصال ورقم." },
          { name: "المصروفات", detail: "اللي طالع من الدرج، عشان صافي الربح يبقى صافي فعلًا." },
          {
            name: "التقارير",
            detail: "الحضور، نسب الإشغال، صافي الربح، وتقسيم شغلك بين اللي على المنصة واللي برّه — ظاهر افتراضيًا من غير ما تدوّر عليه. وكله بيتصدّر CSV أو بيتطبع.",
          },
        ],
      },
      {
        label: "الفريق",
        shot: "centerTeam",
        capabilities: [
          {
            name: "الموظفون",
            detail: "استقبال، مدير، ومحاسب — كل واحد بصلاحياته. المحاسب قراءة فقط، والاستقبال مالوش غير الكاونتر.",
          },
          { name: "ملاحظات الفريق", detail: "لوحة مهام للفريق: مفتوح، اتعمل، اترفض، ومين قرأ." },
          { name: "سجل التدقيق", detail: "كل عملية إدارية ومين عملها وإمتى — ومحدش يقدر يعدّله." },
        ],
      },
    ],
    guarantees: [
      {
        title: "بياناتك معزولة",
        detail: "العزل متطبّق كسياسات داخل قاعدة البيانات نفسها، مش كشرط في كل استعلام. سنتر تاني ما يقدرش يوصل لصف واحد من عندك.",
      },
      {
        title: "الدفتر لا يُمحى",
        detail: "جداول الفلوس مسحوب منها إذن التعديل والحذف — للتطبيق كله، بما فيه إدارة إدورا نفسها.",
      },
      {
        title: "العمولة على المُسلَّم بس",
        detail: "مفيش عمولة على حصة ما اتقفلتش. والحصة اللي من غير سعر بترفض تُقفل أصلًا بدل ما تتقسّم أصفار.",
      },
    ],
    ctaTitle: "افتح دفتر سنترك.",
    ctaBody: "التسجيل مجاني. ابدأ بقاعة واحدة ومدرّس واحد، ووسّع لما تطمن.",
    ctaPrimary: "سجّل سنترك",
  },

  teacher: {
    label: "للمدرّسين",
    headline: "شغلك، وفلوسك، في إيدك.",
    question: "استحقيت كام على الحصص اللي سلّمتها؟",
    lede: "مجموعاتك سواء في سنتر أو لوحدك، حضورك ودرجاتك وملفاتك، ومحفظة بتتحرك بس لما الحصة تُقفل — والتقسيم قدامك قبل ما تأكّد، مش بعدها.",
    hero: "roleTeacher",
    groups: [
      {
        label: "التدريس",
        shot: "teacherTeaching",
        capabilities: [
          {
            name: "فصولي",
            detail: "مجموعاتك في السناتر، ومجموعاتك اللي بتديرها لوحدك بمكان أو أونلاين — من غير ما نخترعلك سنتر وهمي.",
          },
          { name: "الحضور", detail: "كشف الحصة قدامك، وإقفال الحصة بيقسّم الحصيلة في نفس اللحظة." },
          {
            name: "تشيك-إن الباب",
            detail: "لو مفعّل، تسجيل تاني على باب القاعة. اللي سجّل على المكتب ومدخلش بيفضل ظاهر لك في حالته — ما بيتحوّلش لحاضر في الخفاء.",
          },
          { name: "سجل الدرجات", detail: "درجات كل تقييم، وولي الأمر بيتبلّغ أول ما تترصد." },
          { name: "الملفات التعليمية", detail: "ملفات المجموعة، متاحة للطلبة المشتركين بس." },
          { name: "التقييمات", detail: "رأي الطلبة في حصصك." },
        ],
      },
      {
        label: "الإدارة",
        shot: "teacherManage",
        capabilities: [
          {
            name: "مراكزي",
            detail: "طلبات التعاون مع السناتر: المادة والسنة والقاعة والمواعيد والنسبة. أول ما حد يقبل، المجموعة والجدول بيتعملوا فورًا.",
          },
          {
            name: "الفريق",
            detail: "مساعد بيشتغل نيابة عنك في كل حاجة ما عدا الفلوس، وكل حركة بتتسجّل باسمه هو نيابة عنك — مش باسمك.",
          },
          { name: "ملاحظات الفريق", detail: "لوحة مهام بينك وبين مساعدينك." },
        ],
      },
      {
        label: "الفلوس",
        shot: "teacherWallet",
        capabilities: [
          {
            name: "المحفظة",
            detail: "رصيدك بيزيد لما الحصة تُقفل، وكل قيد ظاهر بمصدره. طلب السحب من نفس الشاشة.",
          },
        ],
      },
    ],
    guarantees: [
      {
        title: "بتشوف التقسيم قبل ما تأكّد",
        detail: "نفس الدالة اللي بتحسب اللي على الشاشة هي اللي بتكتب في الدفتر بعدها. مفيش رقمين ممكن يختلفوا.",
      },
      {
        title: "المساعد مالوش دعوة بالفلوس",
        detail: "التفويض بيشمل كل حاجة ما عدا المحفظة والسحب والإعدادات المالية. وده مقفول في النظام، مش اتفاق.",
      },
      {
        title: "سعر القاعة قدامك من الأول",
        detail: "تعريفة القاعة لكل طالب حاضر بتبان على كارت القاعة وقت الحجز، ومربوطة بسقف منشور — مش مفاجأة وقت التسوية.",
      },
    ],
    ctaTitle: "ابدأ من غير سنتر.",
    ctaBody: "تقدر تشتغل لوحدك من أول يوم، وتضيف السناتر لما تحب.",
    ctaPrimary: "سجّل كمدرّس",
  },

  parent: {
    label: "لأولياء الأمور",
    headline: "تعرف ابنك بيحضر فعلًا.",
    question: "ابني بيحضر فعلًا، وبدفع في إيه؟",
    lede: "حضور وغياب ودرجات أول بأول، دفع لحصة أو لشهر من محفظتك أنت، وإطلاع للقراءة فقط على محادثات ابنك مع الكبار.",
    hero: "roleParent",
    groups: [
      {
        label: "الأبناء",
        shot: "parentChildren",
        capabilities: [
          { name: "الأبناء", detail: "أكتر من ابن تحت حساب واحد، وكل شاشة بتتفلتر على اللي مختاره." },
          { name: "الحضور", detail: "حضر ولا لأ، وإمتى، وفي أنهي حصة." },
          { name: "التقدم", detail: "الدرجات لكل مادة، ومقارنة على مدى الترم." },
          {
            name: "سلامة الأبناء",
            detail: "محادثات ابنك مع الكبار، للقراءة فقط — ما بتلمسش الرسائل غير المقروءة ولا علامات القراءة، والطرفين شايفين إشعار إنك مطّلع.",
          },
        ],
      },
      {
        label: "الفلوس",
        shot: "parentPay",
        capabilities: [
          { name: "الرسوم", detail: "اللي اتدفع واللي مستحق، بإيصالات." },
          {
            name: "ادفع لدرس",
            detail: "فعّل حصة أو شهر لابنك من محفظتك أنت. الفلوس بتتسجّل في اسم ابنك زي أي دفعة، وأنت متسجّل كالدافع.",
          },
          { name: "محفظتي", detail: "رصيدك أنت، منفصل تمامًا عن محفظة ابنك." },
        ],
      },
    ],
    guarantees: [
      {
        title: "محفظتك مش محفظة ابنك",
        detail: "بتدفع من فلوسك، مش من رصيده. النظام بيرفض العكس — ده صرف لفلوس الطفل، مش دفع عنه.",
      },
      {
        title: "الاطّلاع للقراءة فقط",
        detail: "مفيش أي طريقة تكتب من مكان ابنك. الاطّلاع على محادثات الكبار بس، وبإذن موثّق.",
      },
      {
        title: "القاصر هو الافتراض",
        detail: "ابنك قاصر إلا لو تاريخ ميلاده موجود ومُوثَّق وسنّه ١٨ فأكثر. غير كده، مراسلة الكبار مقفولة لحد ما وصولك يتأكّد.",
      },
    ],
    ctaTitle: "اربط حساب ابنك.",
    ctaBody: "التسجيل مجاني، والربط بموافقة موثّقة من الطرفين.",
    ctaPrimary: "سجّل كولي أمر",
  },

  student: {
    label: "للطلبة",
    headline: "موادك وجدولك، من غير لخبطة.",
    question: "معايا إيه، وامتى؟",
    lede: "بتختار سنتك وشعبتك مرة واحدة، والمواد بتتحدد لوحدها. جدولك وحضورك ودرجاتك ومحفظتك وكارنيهك — كلهم في مكان واحد.",
    hero: "roleStudent",
    groups: [
      {
        label: "الدراسة",
        shot: "studentLearn",
        capabilities: [
          {
            name: "المواد الدراسية",
            detail: "مواد شعبتك بتظهر لوحدها، ولو عايز تتفرج على غيرها فيه بحث منفصل لكل المواد.",
          },
          { name: "الجدول", detail: "حصص الأسبوع، بالقاعة والمعاد." },
          { name: "الحضور", detail: "سجلك: حضرت كام، وغبت كام." },
          { name: "الدرجات", detail: "درجاتك أول بأول." },
          { name: "الملفات التعليمية", detail: "ملفات المدرّس لمجموعاتك." },
          { name: "التقييمات", detail: "قيّم مدرّسينك." },
        ],
      },
      {
        label: "الحساب",
        shot: "studentCard",
        capabilities: [
          {
            name: "الكارنيه",
            detail: "كود من تمن خانات وQR موقّع، بيتطبع أو يتبعت واتساب. الكود ده هو اللي بيتقرا على الكاونتر.",
          },
          { name: "رمز العائلة", detail: "اربط ولي أمرك بموافقة الطرفين." },
        ],
      },
      {
        label: "الفلوس",
        shot: null,
        capabilities: [
          { name: "المحفظة", detail: "شحن أونلاين أو كاش من الكاونتر، والدفع من الرصيد." },
        ],
      },
    ],
    guarantees: [
      {
        title: "كودك مش فيه أي بيانات عنك",
        detail: "مش مشتق من اسمك ولا تاريخ ميلادك ولا تليفونك. وفيه خانة تحقق بتمسك أي حرف غلط أو حرفين متبدّلين — عشان ما تتحسبش على زميلك.",
      },
      {
        title: "الكارنيه الضايع بيتلغي",
        detail: "الـQR موقّع ومربوط بنسخة. أول ما تبلّغ، كل الكروت المطبوعة قبل كده بتبطل تشتغل.",
      },
      {
        title: "الفلوس بتتحسب مرة واحدة",
        detail: "كل دفعة ليها إيصال برقم، وكل حصة ليها سطر — تقدر تراجعهم في أي وقت.",
      },
    ],
    ctaTitle: "ابدأ بسنتك وشعبتك.",
    ctaBody: "خطوة واحدة، والمواد بتتحدد لوحدها بعدها.",
    ctaPrimary: "سجّل كطالب",
  },

  /* THE ASSISTANT HAS A PAGE, and the reason is a reader I first missed.
     Nobody CHOOSES to be an assistant — a teacher appoints one — so my first
     instinct was that the role belonged inside the teacher's page. That is
     true for one of its two readers and wrong for the other: somebody who has
     just been invited lands on this site to find out what they are allowed to
     do, and a teacher deciding whether to delegate needs to see the BOUNDARY
     before they trust it. Both readers are looking for the same thing — the
     line — so both get the page that draws it. */
  assistant: {
    label: "للمساعدين",
    headline: "كل شغل المدرّس، ما عدا الفلوس.",
    question: "إيه اللي مفوَّض ليّا؟",
    lede: "المساعد بيشتغل نيابة عن مدرّس واحد بالظبط: مجموعاته وحضوره ودرجاته وملفاته وتعاوناته. الفلوس مقفولة، وكل حركة بتتسجّل باسمك أنت نيابة عنه — مش باسمه.",
    hero: "roleAssistant",
    groups: [
      {
        label: "التدريس",
        shot: "assistantDoor",
        capabilities: [
          { name: "فصولي", detail: "مجموعات المدرّس اللي بتشتغل معاه، بنفس الشاشة اللي بيشوفها هو." },
          { name: "الحضور", detail: "كشف الحصة وتسجيل الحضور، وإقفال الحصة." },
          {
            name: "تشيك-إن الباب",
            detail: "الوضع اللي المساعد اتعمل عشانه: التسجيل التاني على باب القاعة، والمدرّس جوّه بيشرح.",
          },
          { name: "سجل الدرجات", detail: "رصد الدرجات، وولي الأمر بيتبلّغ زي ما لو المدرّس رصدها." },
          { name: "الملفات التعليمية", detail: "رفع ملفات المجموعة وإدارتها." },
        ],
      },
      {
        label: "الإدارة",
        shot: "teacherManage",
        capabilities: [
          { name: "مراكزي", detail: "طلبات التعاون مع السناتر: تبعتها وترد عليها نيابة عن المدرّس." },
          { name: "ملاحظات الفريق", detail: "لوحة المهام بينك وبين المدرّس وباقي المساعدين." },
        ],
      },
      {
        label: "التواصل",
        shot: null,
        capabilities: [
          {
            name: "الرسائل",
            detail: "بتراسل باسمك أنت، مش باسم المدرّس. الصلاحية بتتحدد من علاقاته، لكن الاسم اللي على الرسالة اسمك.",
          },
          { name: "الإشعارات", detail: "اللي محتاج منك حاجة، أول بأول." },
        ],
      },
    ],
    guarantees: [
      {
        title: "الفلوس مش مفوَّضة",
        detail: "المحفظة والسحب والإعدادات المالية وإدارة المساعدين التانيين — كلها مقفولة عليك. ده مقفول في النظام نفسه، مش اتفاق بينك وبين المدرّس.",
      },
      {
        title: "مساعد لمدرّس واحد",
        detail: "مستحيل تكون مساعد لمدرّسين في نفس الوقت. ده مفروض في قاعدة البيانات نفسها، مش شرط في الكود.",
      },
      {
        title: "اسمك على كل حركة",
        detail: "كل حاجة بتعملها بتتسجّل «فلان نيابة عن فلان». ده مش مراقبة — ده اللي بيحميك: اللي عملته يبقى منسوب لك، واللي معملتوش ما ينسبش لك.",
      },
    ],
    ctaTitle: "اتدعيت كمساعد؟",
    ctaBody: "الدعوة بتوصلك على إيميلك، وأنت اللي بتحط كلمة السر — المدرّس ما بيشوفهاش ولا بيحطها.",
    ctaPrimary: "افتح دعوتك",
  },
};

const en: Record<RoleSlug, RolePage> = {
  center: {
    label: "For centers",
    headline: "Your whole center, in one ledger.",
    question: "How much came in today, and who still owes?",
    lede: "From the counter to the profit sheet: check-in, cash collection, halls and schedules, staff on bounded permissions, and off-system teachers entered by hand who still land in the same reports as everyone else.",
    hero: "roleCenter",
    groups: [
      {
        label: "The counter",
        shot: "centerCounter",
        capabilities: [
          {
            name: "Counter",
            detail: "The lesson running now is already selected. Search by name or code or read the card, take the cash, and record the check-in — one step.",
          },
          {
            name: "Students",
            detail: "The center's whole roster with search and filters, and a walk-in registration that needs no device in the student's hand.",
          },
          {
            name: "Enrollment requests",
            detail: "What families and students have asked for, accepted or refused with a written reason.",
          },
        ],
      },
      {
        label: "Operations",
        shot: "centerOps",
        capabilities: [
          { name: "Teachers", detail: "Who teaches here, on what terms, and what each lesson owes them." },
          {
            name: "Off-system teachers",
            detail: "A teacher who will not use the platform is entered by hand — groups, attendance, grades and money — and appears in the same reports as everyone else. A completeness report names what is missing.",
          },
          { name: "Classes", detail: "Your groups, their prices, and which payment plans are open on them." },
          { name: "Schedule", detail: "The week per hall and per teacher, with conflicts refused before they happen." },
          {
            name: "Rooms",
            detail: "Each hall and how it is priced: a share of the lesson, or a rate per attending student — which you set yourself, under the published ceiling.",
          },
        ],
      },
      {
        label: "Money",
        shot: "centerMoney",
        capabilities: [
          { name: "Fees", detail: "Everything collected, cash or online, with a receipt and a number." },
          { name: "Expenses", detail: "What left the drawer, so that net profit is actually net." },
          {
            name: "Reports",
            detail: "Attendance, fill rates, net profit, and the split between platform and off-system work — shown by default, not behind a filter. All of it exports to CSV or prints.",
          },
        ],
      },
      {
        label: "Team",
        shot: "centerTeam",
        capabilities: [
          {
            name: "Staff",
            detail: "Receptionist, manager and accountant, each on their own permissions. The accountant is read-only; the receptionist has the counter and nothing else.",
          },
          { name: "Team notes", detail: "A shared to-do board: open, done, declined, and who has read it." },
          { name: "Audit log", detail: "Every administrative action, who did it and when — and nobody can edit it." },
        ],
      },
    ],
    guarantees: [
      {
        title: "Your data is isolated",
        detail: "Isolation is enforced as policies inside the database, not as a clause every query must remember. Another center cannot reach a single row of yours.",
      },
      {
        title: "The ledger cannot be erased",
        detail: "The money tables have UPDATE and DELETE revoked — for the whole application, Edura's own back office included.",
      },
      {
        title: "Commission on delivered lessons only",
        detail: "Nothing is charged on a lesson that never closed. And an unpriced lesson refuses to close at all, rather than distributing zero to everyone.",
      },
    ],
    ctaTitle: "Open your center's ledger.",
    ctaBody: "Registration is free. Start with one hall and one teacher, and widen when you are satisfied.",
    ctaPrimary: "Register your center",
  },

  teacher: {
    label: "For teachers",
    headline: "Your work, and your money, in your hands.",
    question: "What have I earned on the lessons I delivered?",
    lede: "Your groups — inside a center or on your own — your attendance, grades and materials, and a wallet that moves only when a lesson closes. The split is in front of you before you confirm, not after.",
    hero: "roleTeacher",
    groups: [
      {
        label: "Teaching",
        shot: "teacherTeaching",
        capabilities: [
          {
            name: "My classes",
            detail: "Your groups in centers, and the ones you run yourself at your own venue or online — with no shadow center invented for you.",
          },
          { name: "Attendance", detail: "The register in front of you, and closing the lesson splits the takings in the same moment." },
          {
            name: "Door check-in",
            detail: "Where enabled, a second check-in at the hall door. Anyone who checked in at the desk but never walked in stays visibly in their own state — never quietly upgraded to present.",
          },
          { name: "Gradebook", detail: "Marks per assessment, and the parent is notified the moment they are entered." },
          { name: "Materials", detail: "Files for a group, reachable only by the students covered for it." },
          { name: "Reviews", detail: "What your students say about your lessons." },
        ],
      },
      {
        label: "Managing",
        shot: "teacherManage",
        capabilities: [
          {
            name: "My centers",
            detail: "Collaboration requests with centers: subject, year, hall, schedule and share. The moment one side accepts, the group and its schedule exist.",
          },
          {
            name: "Team",
            detail: "An assistant acts on your behalf on everything except the money — and every action is recorded under their name on your behalf, never under yours.",
          },
          { name: "Team notes", detail: "A shared to-do board between you and your assistants." },
        ],
      },
      {
        label: "Money",
        shot: "teacherWallet",
        capabilities: [
          {
            name: "Wallet",
            detail: "Your balance moves when a lesson closes, and every entry names its source. Withdrawals are requested from the same screen.",
          },
        ],
      },
    ],
    guarantees: [
      {
        title: "You see the split before you confirm",
        detail: "The same function that computes what is on screen writes it into the ledger a second later. There are not two numbers that can disagree.",
      },
      {
        title: "An assistant never touches the money",
        detail: "Delegation covers everything except the wallet, payouts and financial settings. That is enforced in the system, not agreed in conversation.",
      },
      {
        title: "You see the hall's rate at booking",
        detail: "A hall's per-attending-student rate is on the hall card when you choose it, and it is bound by a published ceiling — not a surprise at settlement.",
      },
    ],
    ctaTitle: "Start without a center.",
    ctaBody: "You can run your own groups from day one and add centers whenever you want.",
    ctaPrimary: "Register as a teacher",
  },

  parent: {
    label: "For families",
    headline: "Know your child actually attended.",
    question: "Is my child actually attending, and what am I paying for?",
    lede: "Attendance, absence and grades as they happen, payment for a lesson or a month from your own wallet, and read-only sight of your child's threads with adults.",
    hero: "roleParent",
    groups: [
      {
        label: "Children",
        shot: "parentChildren",
        capabilities: [
          { name: "Children", detail: "More than one child on one account, with every screen filtered to the one you picked." },
          { name: "Attendance", detail: "Present or not, when, and for which lesson." },
          { name: "Progress", detail: "Marks per subject, and how they compare across the term." },
          {
            name: "Child safety",
            detail: "Your child's threads with adults, strictly read-only — it never touches unread counts or read receipts, and both sides see a notice that you can read it.",
          },
        ],
      },
      {
        label: "Money",
        shot: "parentPay",
        capabilities: [
          { name: "Fees", detail: "What has been paid and what is due, with receipts." },
          {
            name: "Pay for a lesson",
            detail: "Activate a lesson or a month for your child from your own wallet. The money is recorded in the child's name like any payment, with you recorded as the payer.",
          },
          { name: "My wallet", detail: "Your balance, entirely separate from your child's." },
        ],
      },
    ],
    guarantees: [
      {
        title: "Your wallet is not your child's wallet",
        detail: "You pay from your money, not their balance. The system refuses the reverse — that is spending a child's money, not paying on their behalf.",
      },
      {
        title: "Oversight is read-only",
        detail: "There is no path anywhere to write as your child. Sight of adult threads only, and only on an approved link.",
      },
      {
        title: "Minor is the default",
        detail: "Your child is a minor unless a date of birth exists, is verified, and puts them at 18 or over. Otherwise adult-facing messaging stays locked until your address is confirmed.",
      },
    ],
    ctaTitle: "Link your child's account.",
    ctaBody: "Registration is free, and the link needs approval from both sides.",
    ctaPrimary: "Register as a parent",
  },

  student: {
    label: "For students",
    headline: "Your subjects and your schedule, sorted.",
    question: "What do I have, and when?",
    lede: "You pick your year and track once, and the subjects assign themselves. Your schedule, attendance, grades, wallet and card are all in one place.",
    hero: "roleStudent",
    groups: [
      {
        label: "Learning",
        shot: "studentLearn",
        capabilities: [
          {
            name: "Subjects",
            detail: "Your track's subjects appear on their own, with a separate search if you want to browse everything else.",
          },
          { name: "Schedule", detail: "This week's lessons, with hall and time." },
          { name: "Attendance", detail: "Your record: how many you attended, how many you missed." },
          { name: "Grades", detail: "Your marks as they are entered." },
          { name: "Materials", detail: "Your teacher's files for your groups." },
          { name: "Reviews", detail: "Rate your teachers." },
        ],
      },
      {
        label: "Account",
        shot: "studentCard",
        capabilities: [
          {
            name: "Student ID",
            detail: "An eight-character code and a signed QR, printable or sent over WhatsApp. That code is what the counter reads.",
          },
          { name: "Family", detail: "Link your parent, with approval from both sides." },
        ],
      },
      {
        label: "Money",
        shot: null,
        capabilities: [
          { name: "Wallet", detail: "Top up online or in cash at the counter, and pay from the balance." },
        ],
      },
    ],
    guarantees: [
      {
        title: "Your code carries nothing about you",
        detail: "It is not derived from your name, birth date or phone. And it carries a check character that catches any single wrong character and any two swapped — so you are never marked present for someone else.",
      },
      {
        title: "A lost card can be stopped",
        detail: "The QR is signed and versioned. The moment you report it, every card printed before then stops working.",
      },
      {
        title: "Money is counted once",
        detail: "Every payment has a numbered receipt and every lesson has a line. You can check both whenever you want.",
      },
    ],
    ctaTitle: "Start with your year and track.",
    ctaBody: "One step, and your subjects assign themselves after it.",
    ctaPrimary: "Register as a student",
  },

  assistant: {
    label: "For assistants",
    headline: "Everything the teacher does, except the money.",
    question: "What exactly am I delegated?",
    lede: "An assistant acts for exactly one teacher: their groups, attendance, grades, materials and collaborations. The money is closed, and every action is recorded under your name on their behalf — never under theirs.",
    hero: "roleAssistant",
    groups: [
      {
        label: "Teaching",
        shot: "assistantDoor",
        capabilities: [
          { name: "My classes", detail: "The groups of the teacher you work for, on the same screen they see." },
          { name: "Attendance", detail: "The register, the check-in, and closing the lesson." },
          {
            name: "Door check-in",
            detail: "The job the role exists for: the second check-in at the hall door while the teacher is inside teaching.",
          },
          { name: "Gradebook", detail: "Entering marks, with the parent notified exactly as if the teacher had entered them." },
          { name: "Materials", detail: "Uploading and managing a group's files." },
        ],
      },
      {
        label: "Managing",
        shot: "teacherManage",
        capabilities: [
          { name: "My centers", detail: "Collaboration requests with centers — sent and answered on the teacher's behalf." },
          { name: "Team notes", detail: "The to-do board between you, the teacher, and the other assistants." },
        ],
      },
      {
        label: "Communication",
        shot: null,
        capabilities: [
          {
            name: "Messages",
            detail: "You message as YOURSELF, never as the teacher. Who you may reach is scoped by their relationships, but the name on the message is yours.",
          },
          { name: "Notifications", detail: "What needs you, as it happens." },
        ],
      },
    ],
    guarantees: [
      {
        title: "The money is not delegated",
        detail: "The wallet, payouts, financial settings and managing other assistants are all closed to you. That is enforced in the system, not agreed between you and the teacher.",
      },
      {
        title: "One assistant, one teacher",
        detail: "You cannot assist two teachers at once. That is enforced by the database itself, not by a condition in the code.",
      },
      {
        title: "Your name on every action",
        detail: "Everything you do is recorded as \"you, on behalf of them\". That is not surveillance — it is what protects you: what you did is attributed to you, and what you did not do cannot be.",
      },
    ],
    ctaTitle: "Been invited as an assistant?",
    ctaBody: "The invitation arrives at your own email, and you set your own password — the teacher never sees it and never sets it.",
    ctaPrimary: "Open your invitation",
  },
};

const ROLE_PAGES: Record<Locale, Record<RoleSlug, RolePage>> = { ar, en };

export function getRolePage(locale: Locale, slug: RoleSlug): RolePage {
  return ROLE_PAGES[locale][slug];
}

export type { RolePage, Group, Capability };
