import type { Locale } from "./config";

const ar = {
  meta: {
    title: "لينكتك — كل حصة لها سطر",
    description:
      "منصّة تشغيل السناتر والدروس الخصوصية في مصر: حجز، حضور على الكاونتر، تحصيل كاش أو أونلاين، وتقسيم حصيلة كل حصة في دفتر واحد لا يُمحى.",
  },

  nav: {
    money: "الحساب",
    roles: "لكل دور",
    counter: "الكاونتر",
    integrity: "الضمانات",
    login: "تسجيل الدخول",
    cta: "سجّل سنترك",
    pages: {
      pricing: "الأسعار",
      faq: "أسئلة شائعة",
      trust: "الضمانات",
    },
    menu: "القائمة",
    toggleLang: "English",
    toggleTheme: "تبديل السمة",
    skip: "تخطَّ إلى المحتوى",
  },

  hero: {
    headline: "كل حصة لها سطر.",
    lede: "لينكتك يشغّل السنتر والمدرّس من أول الحجز لآخر جنيه: حضور يتسجّل على الكاونتر، تحصيل كاش أو أونلاين، وحصيلة كل حصة تتقسّم لحظة ما تُقفل — مكتوبة مرة واحدة، ومفيش حد يقدر يمحيها.",
    primary: "سجّل سنترك",
    secondary: "شوف الحساب",
    assurances: [
      "العمولة على الحصة اللي اتسلّمت بس",
      "الكاش يتسجّل زي الأونلاين بالظبط",
      "عربي أولًا، لا ترجمة متأخرة",
    ],
  },


  register: {
    caption: "تسوية حصة واحدة",
    session: "رياضيات — الثالث الثانوي · حصة الأربعاء",
    price: "سعر الحصة",
    platform: "عمولة المنصة",
    center: "حصة السنتر",
    teacher: "نصيب المدرّس",
    currency: "ج.م",
    footnote: "الأرقام مثال. النِّسَب اللي بتشوفها هنا هي نفسها اللي بتتحسب وقت الإقفال.",
  },

  money: {
    label: "الحساب",
    title: "الفلوس بتتقسّم مرة واحدة، بمعادلة واحدة.",
    body: "قيمة الحصة الواحدة بتتحسب بدالة واحدة في النظام كله. الشاشة اللي بتعرضلك التقسيم قبل ما تأكّد، والمحرّك اللي بيكتب في الدفتر بعدها — نفس الدالة. مفيش نسختين ممكن تختلفوا.",
    basesLabel: "أساس التسعير — يختاره صاحب المجموعة",
    defaultBadge: "الافتراضي",
    basesExample: "على كورس من 12 حصة بـ 1200 ج.م، وسعر الحصة المفردة 120 ج.م، تطلع قيمة الحصة الواحدة:",
    bases: [
      {
        name: "سعر الكورس",
        detail: "السعر الكامل مقسوم على عدد الحصص المخطّطة.",
        isDefault: true,
        value: "100.00",
        valueNote: "",
      },
      {
        name: "سعر الحصة",
        detail: "سعر الحصة الواحدة كما هو — للدفع بالحصة.",
        value: "120.00",
        valueNote: "",
        isDefault: false,
      },
      {
        name: "الاشتراك",
        detail: "كل طالب حاضر يتحاسب بما دفعه اشتراكه هو، محسوبًا من الجدول الحقيقي.",
        value: "",
        valueNote: "لكل طالب على حدة",
        isDefault: false,
      },
    ],
    basesFootnote:
      "الرقمان الأولان مختلفان لأن الرقمين حقيقيان: الاشتراك الكامل بيطلع أرخص للحصة من الدخول المفرد. عشان كده الاختيار بيتسجّل على المجموعة، مش بيتحدد بأول دالة تقرأ الصف.",
    guard: {
      title: "الحصة اللي من غير سعر بترفض تُقفل.",
      body: "تقسيم أصفار على الكل شكله نجاح، وهو خسارة دائمة: الدفتر لا يُعدَّل، فالحصة تفضل مقفولة ومحدش اتحاسب. النظام بيرفض ويرجّع كل حاجة مكانها لحد ما السعر يتحط.",
    },
    rails: {
      title: "سِكّتان، دفتر واحد",
      online: "أونلاين — المبلغ بيتقرا من نية الدفع على السيرفر، مش من المتصفح.",
      cash: "كاش على الكاونتر — بيتكتب في نفس الدفتر وفي نفس اللحظة، مش سجل تاني أقل درجة.",
    },
  },

  roles: {
    label: "لكل دور",
    pagesLabel: "صفحة لكل دور",
    title: "ست شاشات، كل واحدة بتجاوب على سؤال واحد.",
    entries: [
      {
        who: "السنتر",
        question: "قبضت كام النهاردة، ومين لسه عليه؟",
        detail:
          "قاعات ومواعيد، موظفو استقبال بصلاحيات محدودة، كشوف تحصيل، ومدرّسون بره النظام بيتسجّلوا يدويًا وبيظهروا في نفس التقارير.",
      },
      {
        who: "المدرّس",
        question: "استحقيت كام على الحصص اللي سلّمتها؟",
        detail:
          "مجموعاتك، جدولك، حضورك، ومحفظة بتتحرك بس لما الحصة تُقفل. تقدر تسيب المتابعة اليومية لمساعد، والفلوس بتفضل في إيدك أنت.",
      },
      {
        who: "ولي الأمر",
        question: "ابني بيحضر فعلًا، وبدفع في إيه؟",
        detail:
          "حضور وغياب ودرجات، دفع لحصة أو لشهر من محفظتك أنت، وإطلاع للقراءة فقط على محادثات ابنك مع الكبار.",
      },
      {
        who: "الطالب",
        question: "معايا إيه، وامتى؟",
        detail:
          "موادك بتتحدد من سنتك وشعبتك تلقائيًا، جدولك، ومحفظتك، وكارنيه بكود من تمن خانات بيتقرا على الكاونتر.",
      },
      {
        who: "المساعد",
        question: "إيه اللي مفوَّض ليّا؟",
        detail:
          "كل اللي المدرّس بيعمله ما عدا الفلوس. وكل حركة بتتسجّل باسمك أنت نيابة عنه — مش باسمه.",
      },
      {
        who: "موظف السنتر",
        question: "أشوف شغلي أنا بس، من غير السنتر كله؟",
        detail:
          "صفة جاهزة بتحدّد الشاشة: استقبال أو مدير أو محاسب. الاستقبال ما بيوصلش للمالية، والمحاسب ما بيوصلش لطلبات التعاون.",
      },
    ],
  },

  counter: {
    label: "الكاونتر",
    title: "أكتر شاشة بتُستخدم في اليوم كله، مبنية للوقوف مش للجلوس.",
    body: "الموظف بيفتح الشاشة فيلاقي الحصة الشغالة دلوقتي مختارة. يدوّر بالاسم أو بالكود أو يقرا الكارنيه، ياخد الكاش، ويسجّل الحضور — في خطوة واحدة، من غير ما يسيب الصفحة.",
    modesLabel: "وضعان للحضور — إعداد لكل مدرّس",
    modes: [
      {
        name: "الكاونتر فقط",
        detail: "تسجيل واحد على المكتب بيثبّت حضور الطالب في الحصة اللي اختارها.",
      },
      {
        name: "الكاونتر ثم الباب",
        detail:
          "تسجيل تاني على باب القاعة. اللي سجّل على المكتب ومدخلش بيفضل في حالته الخاصة، ظاهرة للمدرّس — ما بيتحوّلش لحاضر في الخفاء.",
      },
    ],
  },

  communication: {
    label: "التواصل",
    title: "النظام بيوصل للناس من غير ما حد يدّي رقمه.",
    body:
      "التواصل جوّه النظام مش رفاهية: هو اللي بيخلي المدرّس ما يضطرش يدّي رقمه الشخصي، وولي الأمر يعرف يسأل، والقاصر يفضل تحت عين أهله.",
    entries: [
      {
        title: "محادثات محكومة بالعلاقة",
        detail:
          "مش أي حد بيراسل أي حد. المدرّس بيراسل طلبته وأولياء أمورهم، والسنتر بيراسل اللي مشترك عنده. اللي مالوش علاقة، مالوش باب.",
      },
      {
        title: "القاصر تحت عين أهله",
        detail:
          "لو الطالب قاصر، ولي أمره بيقدر يقرا محادثاته مع الكبار — قراءة بس، من غير ما يكتب مكانه. والقاصر هو الافتراض: من غير تاريخ ميلاد متحقَّق، الحساب بيتعامل كقاصر.",
      },
      {
        title: "واتساب للي لسه ما دخلش",
        detail:
          "الطالب اللي بيتسجّل على الكاونتر بياخد رسالة واتساب فيها رقمه ولينك مؤمَّن يكمّل بيه بياناته — من غير ما يقف على الكاونتر يملّي ورق.",
      },
      {
        title: "ملخص الاتنين لصاحب السنتر",
        detail:
          "إيميل أسبوعي بيلخّص الأسبوع اللي فات: الحصص، التحصيل، ومين لسه عليه. مش تقرير بتفتحه لما تفتكر — بييجي لك.",
      },
    ],
  },
  integrity: {
    label: "الضمانات",
    title: "الوعود دي مكتوبة في قاعدة البيانات، مش في صفحة تسويق.",
    entries: [
      {
        title: "دفتر لا يُمحى",
        detail:
          "جداول الفلوس والتدقيق مسحوب منها إذن التعديل والحذف على مستوى قاعدة البيانات نفسها — للتطبيق كله، بما فيه الإدارة العليا. التصحيح بيتكتب كقيد جديد، والقيد الغلط بيفضل ظاهر.",
      },
      {
        title: "كل سنتر معزول",
        detail:
          "العزل متطبّق كسياسات صفوف داخل قاعدة البيانات، مش كشرط في كل استعلام. استعلام واحد نسي شرطه ما يقدرش يسرّب بيانات سنتر تاني.",
      },
      {
        title: "سجل تدقيق للتحكم",
        detail:
          "كل عملية إدارية بتكتب سطرها في نفس المعاملة اللي بتنفّذها — يعني مستحيل تعدية من غير ما تسيب أثر.",
      },
      {
        title: "القاصر هو الافتراض",
        detail:
          "الطالب قاصر إلا لو تاريخ ميلاده موجود ومُوثَّق وسنّه ١٨ فأكثر. غير كده، مراسلة الكبار مقفولة لحد ما وصول ولي الأمر يتأكّد — من غير ما يتوقف درس ولا دفعة ولا دخول.",
      },
    ],
  },

  media: {
    reserved: "مساحة محجوزة",
    play: "شغّل",
    pause: "أوقف",
    counterBoard:
      "شاشة الكاونتر: الحصة الشغالة مختارة، الكاش يتحصّل والحضور يتسجّل في خطوة واحدة.",
    settlementLoop:
      "المدرّس بيعلّم الحضور، وأول ما يحفظ بيظهر التقسيم: نصيب المدرّس والسنتر والمنصة عن كل طالب، قبل ما يضغط تأكيد.",
    walkInLoop:
      "موظف الاستقبال بيسجّل طالب جديد على الكاونتر: الاسم والتليفون، وفي أقل من دقيقة يطلع كود الطالب والرابط اللي يتسلّم لولي الأمر.",
    doorLoop:
      "المساعد على باب القاعة بيأكّد الطلبة اللي عدّوا من الكاونتر، واحد ورا التاني، من على تليفونه.",
    settlementConfirm:
      "خطوة التأكيد قبل إقفال الحصة — نفس الأرقام اللي بتتكتب في الدفتر بعدها بثانية.",
    studentCard: "كارنيه الطالب على التليفون، بكود من تمن خانات وQR موقّع.",
    roles: "من داخل النظام",
    roleCenter: "لوحة السنتر: التحصيل اليومي والمستحق على كل طالب.",
    roleTeacher: "شاشة المدرّس وهو بيقفل حصة، والتقسيم قدامه قبل ما يأكّد.",
    roleParent: "ولي الأمر بيدفع حصة أو شهر لابنه من محفظته هو.",
    roleStudent: "مواد الطالب المتحدّدة من سنته وشعبته، وجدوله.",
    roleAssistant: "المساعد بيسجّل حضور نيابة عن المدرّس، والتسجيل باسمه هو.",
    roleStaff: "شاشة موظف الاستقبال في نص الورديّة — ست حاجات، مش كونسول صاحب السنتر.",
  },

  closing: {
    title: "افتح دفترك.",
    body: "التسجيل مجاني، والعمولة مش بتتحسب غير على الحصص اللي اتسلّمت فعلًا.",
    primary: "سجّل سنترك",
    secondary: "أنا مدرّس مستقل",
    sealTop: "لينكتك",
    sealBottom: "مصر",
  },

  footer: {
    tagline: "منصّة تشغيل السناتر والدروس الخصوصية.",
    platform: "المنصّة",
    help: "المساعدة",
    legal: "قانوني",
    links: {
      pricing: "الأسعار",
      faq: "أسئلة شائعة",
      trust: "الثقة والأمان",
      contact: "تواصل معنا",
      privacy: "الخصوصية",
      terms: "الشروط",
    },
    rights: "كل الحقوق محفوظة.",
  },
};

type Messages = typeof ar;

const en: Messages = {
  meta: {
    title: "Linktich — every lesson gets a line",
    description:
      "The operating layer for Egypt's teaching centers and private tutors: booking, counter check-in, cash or online collection, and every lesson's revenue split written into one ledger that cannot be erased.",
  },

  nav: {
    money: "The account",
    roles: "By role",
    counter: "The counter",
    integrity: "Guarantees",
    login: "Sign in",
    cta: "Register",
    pages: {
      pricing: "Pricing",
      faq: "FAQ",
      trust: "Trust",
    },
    menu: "Menu",
    toggleLang: "العربية",
    toggleTheme: "Toggle theme",
    skip: "Skip to content",
  },

  hero: {
    headline: "Every lesson gets a line.",
    lede: "Linktich runs a center or a tutor from the first booking to the last pound: check-in recorded at the counter, cash or online collection, and each lesson's takings split the moment it closes — written once, and beyond anyone's reach to erase.",
    primary: "Register your center",
    secondary: "See the account",
    assurances: [
      "Commission on delivered lessons only",
      "Cash is recorded exactly as online is",
      "Arabic first, not translated later",
    ],
  },


  register: {
    caption: "One lesson, settled",
    session: "Mathematics — Grade 12 · Wednesday session",
    price: "Lesson price",
    platform: "Platform commission",
    center: "Center share",
    teacher: "Teacher's share",
    currency: "EGP",
    footnote: "Figures are illustrative. The rates shown here are the ones the engine settles at.",
  },

  money: {
    label: "The account",
    title: "The money is split once, by one formula.",
    body: "What a single lesson is worth is derived by one function for the whole system. The screen that shows you the split before you confirm, and the engine that writes it into the ledger afterwards, call that same function. There is no second copy to disagree with the first.",
    basesLabel: "Settlement basis — chosen by the group's owner",
    defaultBadge: "Default",
    basesExample:
      "On a 12-lesson course at 1,200 EGP with a single-lesson price of 120 EGP, one lesson is worth:",
    bases: [
      {
        name: "Course price",
        detail: "Full price divided by the planned session count.",
        isDefault: true,
        value: "100.00",
        valueNote: "",
      },
      {
        name: "Session price",
        detail: "The price of one lesson, as set — for pay-as-you-go.",
        value: "120.00",
        valueNote: "",
        isDefault: false,
      },
      {
        name: "Subscription",
        detail: "Each attending student settles at what their own coverage paid, counted from the real schedule.",
        value: "",
        valueNote: "per student",
        isDefault: false,
      },
    ],
    basesFootnote:
      "The first two differ because both numbers are real: a full-term enrolment amortises cheaper per lesson than a drop-in. That is why the choice is recorded on the group, rather than decided by whichever function reads the row first.",
    guard: {
      title: "An unpriced lesson refuses to close.",
      body: "Distributing zero to everyone looks like a success and is a permanent loss: the ledger is append-only, so the lesson stays closed and nobody was ever paid. The system refuses and rolls the whole thing back until a price exists.",
    },
    rails: {
      title: "Two rails, one ledger",
      online: "Online — the amount is read from the server-side payment intent, never from the browser.",
      cash: "Cash at the counter — written into the same ledger, in the same moment. Not a lesser second record.",
    },
  },

  roles: {
    label: "By role",
    pagesLabel: "A page for each",
    title: "Six screens, each answering one question.",
    entries: [
      {
        who: "The center",
        question: "How much came in today, and who still owes?",
        detail:
          "Halls and schedules, front-desk staff on bounded permissions, collection sheets, and off-system teachers entered by hand who still land in the same reports as everyone else.",
      },
      {
        who: "The teacher",
        question: "What have I earned on the lessons I delivered?",
        detail:
          "Your groups, your schedule, your attendance, and a wallet that moves only when a lesson closes. Hand the daily running to an assistant; the money authority stays with you.",
      },
      {
        who: "The parent",
        question: "Is my child actually attending, and what am I paying for?",
        detail:
          "Attendance, absence and grades, payment for a lesson or a month from your own wallet, and read-only sight of your child's threads with adults.",
      },
      {
        who: "The student",
        question: "What do I have, and when?",
        detail:
          "Subjects assigned automatically from your year and track, your schedule, your wallet, and a card carrying an eight-character code the counter can read.",
      },
      {
        who: "The assistant",
        question: "What exactly am I delegated?",
        detail:
          "Everything the teacher does, except the money. And every action is recorded under your name on their behalf — never under theirs.",
      },
      {
        who: "Center staff",
        question: "Can I see only my own job, not the whole center?",
        detail:
          "A preset decides the screen: receptionist, manager or accountant. A receptionist cannot reach finance, and an accountant cannot reach collaboration requests.",
      },
    ],
  },

  counter: {
    label: "The counter",
    title: "The most-used screen of the day, built for standing up.",
    body: "The clerk opens it and the lesson running right now is already selected. Search by name or code, or read the card, take the cash, and record the check-in — one flow, without leaving the page.",
    modesLabel: "Two attendance modes — a per-teacher setting",
    modes: [
      {
        name: "Counter only",
        detail: "A single check-in at the desk marks the student present for the session they chose.",
      },
      {
        name: "Counter, then door",
        detail:
          "A second check-in at the hall door. Anyone who checked in at the desk but never walked in stays in their own visible state — never quietly upgraded to present.",
      },
    ],
  },

  communication: {
    label: "Communication",
    title: "The system reaches people without anyone handing out a number.",
    body:
      "Messaging inside the product is not a nicety: it is what lets a teacher keep their personal number private, a parent ask a question, and a minor stay within their guardian's sight.",
    entries: [
      {
        title: "Threads scoped by relationship",
        detail:
          "Not everyone can message everyone. A teacher reaches their own students and those students' parents; a center reaches the people subscribed to it. No relationship, no door.",
      },
      {
        title: "A minor stays in their guardian's sight",
        detail:
          "If the student is a minor, their guardian can read their threads with adults — read-only, never writing as them. And minor is the default: without a verified date of birth, the account is treated as a minor.",
      },
      {
        title: "WhatsApp for whoever has not signed in yet",
        detail:
          "A student registered at the counter gets a WhatsApp message with their student ID and a secure link to finish their own details — instead of standing at the desk filling in forms.",
      },
      {
        title: "The owner's Monday email",
        detail:
          "A weekly summary of the week that ended: lessons, collections, and who still owes. Not a report you open when you remember — it arrives.",
      },
    ],
  },
  integrity: {
    label: "Guarantees",
    title: "These promises live in the database, not on a marketing page.",
    entries: [
      {
        title: "A ledger that cannot be erased",
        detail:
          "The money and audit tables have UPDATE and DELETE revoked at the database level — for the whole application, back office included. A correction is written as a new entry, and the wrong one stays visible.",
      },
      {
        title: "Every center isolated",
        detail:
          "Isolation is enforced as row-level policies inside the database, not as a clause every query must remember. One endpoint that forgets its condition still cannot reach another center's rows.",
      },
      {
        title: "An audit trail on control",
        detail:
          "Every administrative operation writes its row in the same transaction that performs it — so a change cannot commit without leaving a trail.",
      },
      {
        title: "Minor is the default",
        detail:
          "A student is a minor unless a date of birth exists, is verified, and puts them at 18 or over. Otherwise adult-facing messaging stays locked until a guardian address is confirmed — without stopping a single lesson, payment or sign-in.",
      },
    ],
  },

  media: {
    reserved: "Reserved",
    play: "Play",
    pause: "Pause",
    counterBoard:
      "The counter board: the running lesson already selected, cash taken and attendance recorded in one step.",
    settlementLoop:
      "A teacher marks the room present, and the moment it saves the split appears: the teacher's share, the center's and the platform's, per student, before the confirm is pressed.",
    walkInLoop:
      "A receptionist registers a new student at the counter — name and phone — and inside a minute the student code and the link to hand the guardian are on screen.",
    doorLoop:
      "An assistant at the hall door confirms the students who already passed the counter, one after another, from a phone.",
    settlementConfirm:
      "The confirm step before a lesson closes — the same figures the ledger records a second later.",
    studentCard: "The student card on a phone: an eight-character code and a signed QR.",
    roles: "Inside the system",
    roleCenter: "The center's board: today's takings and who still owes.",
    roleTeacher: "A teacher closing a lesson, with the split in front of them before they confirm.",
    roleParent: "A parent paying for a lesson or a month from their own wallet.",
    roleStudent: "A student's subjects, assigned from their year and track, and their schedule.",
    roleAssistant: "An assistant recording attendance for a teacher — under the assistant's name.",
    roleStaff: "A receptionist's screen mid-shift — six things, not the owner's console.",
  },

  closing: {
    title: "Open your ledger.",
    body: "Registration is free, and commission is only ever charged on lessons actually delivered.",
    primary: "Register your center",
    secondary: "I'm an independent teacher",
    sealTop: "LINKTICH",
    sealBottom: "EGYPT",
  },

  footer: {
    tagline: "The operating layer for teaching centers and private lessons.",
    platform: "Platform",
    help: "Help",
    legal: "Legal",
    links: {
      pricing: "Pricing",
      faq: "FAQ",
      trust: "Trust & safety",
      contact: "Contact",
      privacy: "Privacy",
      terms: "Terms",
    },
    rights: "All rights reserved.",
  },
};

const MESSAGES: Record<Locale, Messages> = { ar, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

export type { Messages };
