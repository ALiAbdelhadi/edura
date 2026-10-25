import type { Locale } from "./config";

// One class on the hero's sample week. `day` 0 = Saturday … 5 = Thursday;
// `slot` is the row (0 = earliest).
type WeekClass = { day: number; slot: number; subject: string; time: string; next?: boolean };

// One illustrated teacher card. `look` picks the faceless portrait; `subject`
// is a catalog code for the small subject mark.
type TeacherLook = "hijab" | "hijab-glasses" | "beard" | "glasses" | "bun" | "short";
type TeacherCard = { look: TeacherLook; role: string; grade: string; when: string; mode: "onsite" | "online"; subject: string };

const ar = {
  meta: {
    title: "لينكتك — حصتك، في مكانها.",
    description:
      "جدول حصصك وحضورك ودفعك في مكان واحد، للطالب وولي الأمر. اختار سنتك وشعبتك، اشترك مع مدرّسك أو السنتر، وادفع أونلاين أو كاش. التسجيل مجاني.",
  },


  nav: {
    subjects: "المواد",
    how: "ازاي بتشتغل",
    parents: "لولي الأمر",
    login: "تسجيل الدخول",
    cta: "سجّل مجانًا",
    pages: {
      pricing: "الأسعار",
      faq: "أسئلة شائعة",
      trust: "الأمان",
    },
    menu: "القائمة",
    toggleLang: "English",
    toggleTheme: "تبديل السمة",
    skip: "انتقل للمحتوى",
  },

  hero: {
    title: "حصتك، في مكانها.",
    lede: "جدولك وحضورك ودفعك في مكان واحد — للطالب وولي الأمر.",
    primary: "سجّل مجانًا",
    secondary: "شوف ازاي بتشتغل",
    note: "مجاني للطالب ولولي الأمر.",
    week: {
      caption: "مثال لأسبوع طالب",
      days: ["السبت", "الحد", "الاتنين", "التلات", "الأربع", "الخميس"],
      mine: "حصصك",
      next: "الحصة الجاية",
      classes: [
        { day: 0, slot: 2, subject: "رياضيات", time: "٦:٣٠ مساءً" },
        { day: 1, slot: 0, subject: "عربي", time: "٤:٠٠ عصرًا" },
        { day: 2, slot: 1, subject: "فيزياء", time: "٥:٠٠ عصرًا" },
        { day: 3, slot: 2, subject: "رياضيات", time: "٦:٣٠ مساءً" },
        { day: 4, slot: 1, subject: "فيزياء", time: "٥:٠٠ عصرًا", next: true },
        { day: 5, slot: 3, subject: "إنجليزي", time: "٨:٠٠ مساءً" },
      ] as WeekClass[],
    },
  },

  subjects: {
    title: "موادك، من سنتك وشعبتك.",
    lede: "كل مواد المنهج المصري، مرتّبة بالمرحلة. لما تسجّل بسنتك وشعبتك، موادك بتظهر في حسابك لوحدها.",
    figuresLabel: "الكتالوج",
    figures: {
      systems: "أنظمة تعليم",
      grades: "سنة دراسية",
      tracks: "شُعب ومسارات",
      subjects: "مادة",
    },
    detail: "تعليم عام، أزهري، وشهادة البكالوريا — من أولى ابتدائي لتالتة ثانوي.",
  },

  cards: {
    groupsLabel: "المرحلة",
    groups: {
      "general-primary": "ابتدائي",
      "general-preparatory": "إعدادي",
      "general-secondary": "ثانوي",
      azhari: "أزهري",
      bacc: "البكالوريا",
    },
    years: { one: "سنة دراسية واحدة", two: "سنتين دراسيتين", few: "{n} سنين دراسية", many: "{n} سنة دراسية" },
    showAll: "اعرض كل المواد ({n})",
    showLess: "اعرض أقل",
    cta: "سجّل بسنتك وشعبتك",
    searchLabel: "دوّر على مادة",
    searchPlaceholder: "اكتب اسم المادة، زي فيزياء",
    clear: "امسح البحث",
    categoriesLabel: "نوع المادة",
    all: "الكل",
    categories: {
      languages: "اللغات",
      math: "الرياضيات",
      sciences: "العلوم",
      humanities: "الدراسات والإنسانيات",
      religion: "الدينية والشرعية",
      skills: "التكنولوجيا والأنشطة",
    },
    count: { one: "مادة واحدة", two: "مادتين", few: "{n} مواد", many: "{n} مادة" },
    empty: "مفيش مادة اسمها «{q}» في {stage}.",
    emptyHint: "جرّب اسم أقصر، أو امسح البحث.",
    elsewhere: "موجودة في:",
    allCategories: "دوّر في كل الأنواع",
    yearLabel: "السنة الدراسية",
    allYears: "كل السنين",
    trackLabel: "الشعبة",
    allTracks: "كل الشعب",
    trackOnly: "في شعبة {t} بس",
    everyTrack: "لكل الشعب",
    allYearsAction: "شوف كل السنين",
  },

  teachers: {
    title: "مدرّسين لكل مادة، في السنتر أو أونلاين.",
    lede: "من حسابك تشوف مدرّسين سنتك وشعبتك: المادة والسنة والميعاد، وتشترك في الحصة على طول.",
    modes: { onsite: "في السنتر", online: "أونلاين" },
    items: [
      { look: "hijab", role: "مدرّسة رياضيات", grade: "تالتة ثانوي", when: "السبت · ٦:٣٠ مساءً", mode: "onsite", subject: "math" },
      { look: "beard", role: "مدرّس لغة عربية", grade: "تالتة إعدادي", when: "الحد · ٤:٠٠ عصرًا", mode: "onsite", subject: "arabic" },
      { look: "glasses", role: "مدرّس فيزياء", grade: "تانية ثانوي", when: "الاتنين · ٥:٠٠ عصرًا", mode: "online", subject: "physics" },
      { look: "bun", role: "مدرّسة لغة إنجليزية", grade: "تالتة ثانوي", when: "الخميس · ٨:٠٠ مساءً", mode: "online", subject: "english" },
      { look: "glasses", role: "مدرّس تاريخ", grade: "تانية ثانوي", when: "السبت · ٣:٠٠ عصرًا", mode: "onsite", subject: "history" },
      { look: "hijab-glasses", role: "مدرّسة كيمياء", grade: "تانية ثانوي", when: "التلات · ٧:٠٠ مساءً", mode: "onsite", subject: "chemistry" },
      { look: "hijab", role: "مدرّسة تربية دينية", grade: "سادسة ابتدائي", when: "الجمعة · ١١:٠٠ صباحًا", mode: "online", subject: "religion" },
      { look: "short", role: "مدرّس أحياء", grade: "تالتة ثانوي", when: "الأربع · ٤:٣٠ عصرًا", mode: "onsite", subject: "biology" },
      { look: "beard", role: "مدرّس حاسب آلي", grade: "أولى إعدادي", when: "الحد · ٦:٠٠ مساءً", mode: "onsite", subject: "computer" },
    ] as TeacherCard[],
    note: "الصور توضيحية. المدرّسين الحقيقيين بأساميهم ومواعيدهم بيظهروا جوّه حسابك.",
    cta: "سجّل كطالب",
    searchLabel: "دوّر على مدرّس",
    searchPlaceholder: "اكتب المادة أو اليوم، زي كيمياء",
    count: { one: "مدرّس واحد", two: "مدرّسين اتنين", few: "{n} مدرّسين", many: "{n} مدرّس" },
    empty: "مفيش مثال هنا لـ«{q}».",
    emptyHint: "دي أمثلة بس. جوّه حسابك بتدوّر في كل مدرّسين سنتك وشعبتك.",
  },

  steps: {
    title: "من التسجيل للحصة، في أربع خطوات.",
    items: [
      {
        title: "سجّل واختار سنتك وشعبتك",
        body: "موادك بتتحدد لوحدها، فمش هتدوّر وسط مواد مش بتاعتك.",
      },
      {
        title: "اشترك مع مدرّس أو سنتر",
        body: "دوّر بالمادة أو باليوم. الحصة في السنتر، أونلاين لايف، أو الاتنين، وبيبان ده قبل ما تشترك.",
      },
      {
        title: "ادفع زي ما يريحك",
        body: "بالكارت أو محفظة الموبايل، أو كاش على كاونتر السنتر. الاتنين بيتسجّلوا في حسابك.",
      },
      {
        title: "احضر بالكارنيه",
        body: "كارنيه على موبايلك بكود وQR. حضورك بيتسجّل على الكاونتر، وولي أمرك بيشوفه.",
      },
    ],
  },

  homes: {
    title: "حساب للطالب، وحساب لولي الأمر.",
    more: "اعرف أكتر",
    student: {
      title: "الطالب",
      body: "موادك وجدولك وحضورك ودرجاتك، وكارنيهك على الموبايل.",
    },
    parent: {
      title: "ولي الأمر",
      body: "تابع حضور ابنك ودرجاته، وادفع حصته أو شهره من محفظتك.",
    },
  },

  pay: {
    title: "بتدفع على قد ما بتحضر.",
    lede: "المدرّس أو السنتر بيحدد السعر وطريقة الاشتراك لكل مجموعة، وده اللي بتدفعه.",
    plans: [
      {
        name: "بالحصة",
        body: "تدفع تمن حصة واحدة وتحضرها. مناسب لو لسه بتجرّب المدرّس.",
        points: ["بتدفع قبل الحصة", "من غير التزام بعدها"],
      },
      {
        name: "بالشهر",
        body: "اشتراك شهري في المجموعة، وإنت اللي بتجدّده.",
        points: ["مفيش تجديد تلقائي", "بتشوف حضور الشهر كله"],
      },
    ],
    methodsTitle: "طرق الدفع",
    methods: [
      { title: "كارت بنكي", body: "أونلاين عن طريق Paymob." },
      { title: "محفظة موبايل", body: "أونلاين، من موبايلك." },
      { title: "كاش في السنتر", body: "على الكاونتر، وبيتسجّل في حسابك زي الأونلاين." },
      { title: "محفظة ولي الأمر", body: "ولي الأمر بيدفع من محفظته، والحصة بتفضل باسم الطالب." },
    ],
  },

  safety: {
    title: "ابنك قاصر، لحد ما يثبت العكس.",
    items: [
      {
        title: "ولي الأمر في الصورة",
        body: "أي طالب تحت ١٨، أو سنّه مش متوثّق، بيتعامل كقاصر. مراسلته مع الكبار مقفولة لحد ما إيميل ولي أمره يتأكد، والحصص والحضور شغالين عادي.",
      },
      {
        title: "كود من غير بيانات شخصية",
        body: "كود الطالب مش مبني على اسمه ولا تاريخ ميلاده ولا تليفونه، وفيه خانة بتمسك أي غلطة في كتابته.",
      },
      {
        title: "كل سنتر لوحده",
        body: "بيانات كل سنتر معزولة عن التاني جوه قاعدة البيانات نفسها.",
      },
    ],
    more: "تفاصيل الأمان",
  },

  faq: {
    title: "أسئلة بتتسأل كتير",
    more: "كل الأسئلة",
    items: [
      {
        q: "التسجيل بفلوس؟",
        a: "لا. التسجيل مجاني للطالب ولولي الأمر. بتدفع بس تمن الحصة أو الشهر اللي بتشترك فيه.",
      },
      {
        q: "لو عايز مادة مش في شعبتي؟",
        a: "موادك بتظهر من سنتك وشعبتك، وفيه «كل المواد» تدوّر فيها على أي مادة.",
      },
      {
        q: "ينفع أدفع كاش؟",
        a: "أيوه، على كاونتر السنتر. الدفعة بتتسجّل في حسابك زي الدفع الأونلاين بالظبط.",
      },
      {
        q: "الحصص أونلاين ولا في السنتر؟",
        a: "حسب المجموعة: في السنتر، أونلاين لايف، أو الاتنين. بيبان قبل ما تشترك، وتقدر تفلتر بيه.",
      },
      {
        q: "اتسجّلت في السنتر ومعييش حساب؟",
        a: "موظف الاستقبال بيسجّلك، وبيوصلك على واتساب كود الطالب ورابط آمن تكمّل بيه حسابك.",
      },
    ],
  },

  closing: {
    title: "ابدأ من سنتك وشعبتك.",
    body: "سجّل مجانًا، وموادك تبقى قدامك من أول دقيقة.",
    primary: "سجّل مجانًا",
    secondary: "أنا ولي أمر",
  },


  roles: {
    label: "لكل دور",
  },

  footer: {
    tagline: "جدول الحصص والحضور والدفع، للطالب وولي الأمر — من أولى ابتدائي لتالتة ثانوي.",
    platform: "المنصّة",
    help: "المساعدة",
    legal: "قانوني",
    links: {
      pricing: "الأسعار",
      faq: "أسئلة شائعة",
      trust: "الأمان",
      contact: "تواصل معانا",
      privacy: "الخصوصية",
      terms: "الشروط",
    },
    rights: "كل الحقوق محفوظة.",
  },

  media: {
    reserved: "مساحة محجوزة",
    play: "شغّل",
    pause: "أوقف",
    counterBoard:
      "شاشة الكاونتر: الحصة الشغالة مختارة، الكاش يتحصّل والحضور يتسجّل في خطوة واحدة.",
    walkInLoop:
      "موظف الاستقبال بيسجّل طالب جديد على الكاونتر: الاسم والتليفون، وفي أقل من دقيقة يطلع كود الطالب والرابط اللي يتسلّم لولي الأمر.",
    doorLoop:
      "المساعد على باب القاعة بيأكّد الطلبة اللي عدّوا من الكاونتر، واحد ورا التاني، من على تليفونه.",
    studentCard: "كارنيه الطالب على التليفون، بكود من تمن خانات وQR موقّع.",
    roles: "من داخل النظام",
    roleCenter: "لوحة السنتر: التحصيل اليومي والمستحق على كل طالب.",
    roleTeacher: "فصول المدرّس: مجموعاته، ومواعيد حصصها، وحالة كل حصة.",
    roleParent: "ولي الأمر بيدفع حصة أو شهر لابنه من محفظته هو.",
    roleStudent: "مواد الطالب المتحدّدة من سنته وشعبته، وجدوله.",
    roleAssistant: "المساعد بيسجّل حضور نيابة عن المدرّس، والتسجيل باسمه هو.",
    roleStaff: "شاشة موظف الاستقبال في نص الورديّة — ست حاجات، مش كونسول صاحب السنتر.",
  },
};

type Messages = typeof ar;

const en: Messages = {
  meta: {
    title: "Linktich — Your class, right where it belongs.",
    description:
      "Your timetable, attendance and payments in one place, for students and parents. Pick your year and track, subscribe to your teacher or center, and pay online or in cash. Sign-up is free.",
  },


  nav: {
    subjects: "Subjects",
    how: "How it works",
    parents: "For parents",
    login: "Sign in",
    cta: "Sign up free",
    pages: {
      pricing: "Pricing",
      faq: "FAQ",
      trust: "Safety",
    },
    menu: "Menu",
    toggleLang: "العربية",
    toggleTheme: "Toggle theme",
    skip: "Skip to content",
  },

  hero: {
    title: "Your class, right where it belongs.",
    lede: "Your timetable, attendance and payments in one place — for students and parents.",
    primary: "Sign up free",
    secondary: "See how it works",
    note: "Free for students and parents.",
    week: {
      caption: "A sample student week",
      days: ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu"],
      mine: "Your classes",
      next: "Next class",
      classes: [
        { day: 0, slot: 2, subject: "Maths", time: "6:30 pm" },
        { day: 1, slot: 0, subject: "Arabic", time: "4:00 pm" },
        { day: 2, slot: 1, subject: "Physics", time: "5:00 pm" },
        { day: 3, slot: 2, subject: "Maths", time: "6:30 pm" },
        { day: 4, slot: 1, subject: "Physics", time: "5:00 pm", next: true },
        { day: 5, slot: 3, subject: "English", time: "8:00 pm" },
      ],
    },
  },

  subjects: {
    title: "Your subjects, from your year and track.",
    lede: "Every subject in the Egyptian curriculum, sorted by stage. Sign up with your year and track and your own subjects appear in your account by themselves.",
    figuresLabel: "The catalog",
    figures: {
      systems: "education systems",
      grades: "school years",
      tracks: "tracks",
      subjects: "subjects",
    },
    detail: "General, Azhari and the Egyptian Baccalaureate — from Primary 1 to Secondary 3.",
  },

  cards: {
    groupsLabel: "Stage",
    groups: {
      "general-primary": "Primary",
      "general-preparatory": "Preparatory",
      "general-secondary": "Secondary",
      azhari: "Azhari",
      bacc: "Baccalaureate",
    },
    years: { one: "1 school year", two: "2 school years", few: "{n} school years", many: "{n} school years" },
    showAll: "Show all subjects ({n})",
    showLess: "Show fewer",
    cta: "Sign up with your year and track",
    searchLabel: "Search subjects",
    searchPlaceholder: "Type a subject, like Physics",
    clear: "Clear search",
    categoriesLabel: "Subject type",
    all: "All",
    categories: {
      languages: "Languages",
      math: "Maths",
      sciences: "Sciences",
      humanities: "Humanities",
      religion: "Religious studies",
      skills: "Tech & activities",
    },
    count: { one: "1 subject", two: "2 subjects", few: "{n} subjects", many: "{n} subjects" },
    empty: "No subject matches “{q}” in {stage}.",
    emptyHint: "Try a shorter name, or clear the search.",
    elsewhere: "Found in:",
    allCategories: "Search every type",
    yearLabel: "School year",
    allYears: "All years",
    trackLabel: "Track",
    allTracks: "All tracks",
    trackOnly: "Only in {t}",
    everyTrack: "Every track",
    allYearsAction: "See every year",
  },

  teachers: {
    title: "A teacher for every subject, at the center or online.",
    lede: "Your account shows the teachers for your year and track — subject, year and time — and you subscribe to the class right there.",
    modes: { onsite: "At the center", online: "Online" },
    items: [
      { look: "hijab", role: "Maths teacher", grade: "Secondary 3", when: "Sat · 6:30 pm", mode: "onsite", subject: "math" },
      { look: "beard", role: "Arabic teacher", grade: "Preparatory 3", when: "Sun · 4:00 pm", mode: "onsite", subject: "arabic" },
      { look: "glasses", role: "Physics teacher", grade: "Secondary 2", when: "Mon · 5:00 pm", mode: "online", subject: "physics" },
      { look: "bun", role: "English teacher", grade: "Secondary 3", when: "Thu · 8:00 pm", mode: "online", subject: "english" },
      { look: "glasses", role: "History teacher", grade: "Secondary 2", when: "Sat · 3:00 pm", mode: "onsite", subject: "history" },
      { look: "hijab-glasses", role: "Chemistry teacher", grade: "Secondary 2", when: "Tue · 7:00 pm", mode: "onsite", subject: "chemistry" },
      { look: "hijab", role: "Religious education teacher", grade: "Primary 6", when: "Fri · 11:00 am", mode: "online", subject: "religion" },
      { look: "short", role: "Biology teacher", grade: "Secondary 3", when: "Wed · 4:30 pm", mode: "onsite", subject: "biology" },
      { look: "beard", role: "Computer science teacher", grade: "Preparatory 1", when: "Sun · 6:00 pm", mode: "onsite", subject: "computer" },
    ],
    note: "Illustrations only. Real teachers, with their names and times, appear inside your account.",
    cta: "Sign up as a student",
    searchLabel: "Search teachers",
    searchPlaceholder: "Type a subject or day, like Chemistry",
    count: { one: "1 teacher", two: "2 teachers", few: "{n} teachers", many: "{n} teachers" },
    empty: "No example here matches “{q}”.",
    emptyHint: "These are only examples. In your account you search every teacher for your year and track.",
  },

  steps: {
    title: "From sign-up to the classroom, in four steps.",
    items: [
      {
        title: "Sign up and pick your year and track",
        body: "Your subjects are set for you, so you never wade through subjects that are not yours.",
      },
      {
        title: "Subscribe to a teacher or a center",
        body: "Search by subject or by day. Classes run at the center, live online, or both, and you see which before you subscribe.",
      },
      {
        title: "Pay the way that suits you",
        body: "By card or mobile wallet, or cash at the center's counter. Both are recorded on your account.",
      },
      {
        title: "Check in with your card",
        body: "A card on your phone with a code and a QR. Your attendance is recorded at the counter, and your parent sees it.",
      },
    ],
  },

  homes: {
    title: "One account for the student, one for the parent.",
    more: "Learn more",
    student: {
      title: "Student",
      body: "Your subjects, timetable, attendance and grades, and your card on your phone.",
    },
    parent: {
      title: "Parent",
      body: "Follow your child's attendance and grades, and pay for a class or a month from your wallet.",
    },
  },

  pay: {
    title: "Pay for what you attend.",
    lede: "The teacher or center sets the price and the way to subscribe for each group, and that is what you pay.",
    plans: [
      {
        name: "Per class",
        body: "Pay for one class and attend it. Good while you are still trying a teacher.",
        points: ["Pay before the class", "No commitment after it"],
      },
      {
        name: "Monthly",
        body: "A monthly subscription to the group, which you renew yourself.",
        points: ["No automatic renewal", "See the whole month's attendance"],
      },
    ],
    methodsTitle: "Ways to pay",
    methods: [
      { title: "Bank card", body: "Online, through Paymob." },
      { title: "Mobile wallet", body: "Online, from your phone." },
      { title: "Cash at the center", body: "At the counter, recorded on your account just like online." },
      { title: "Parent's wallet", body: "A parent pays from their own wallet, and the class stays in the student's name." },
    ],
  },

  safety: {
    title: "Your child is a minor until proven otherwise.",
    items: [
      {
        title: "The parent stays in the picture",
        body: "Any student under 18, or whose age is not verified, is treated as a minor. Their messaging with adults stays locked until a parent's email is confirmed, while classes and check-ins carry on as normal.",
      },
      {
        title: "A code with no personal data",
        body: "The student code is not built from a name, a birth date or a phone number, and one of its characters catches any typo.",
      },
      {
        title: "Every center on its own",
        body: "Each center's data is kept apart from every other inside the database itself.",
      },
    ],
    more: "Safety details",
  },

  faq: {
    title: "Questions people ask a lot",
    more: "All questions",
    items: [
      {
        q: "Does signing up cost anything?",
        a: "No. Sign-up is free for students and parents. You only pay for the class or month you subscribe to.",
      },
      {
        q: "What if I want a subject outside my track?",
        a: "Your subjects come from your year and track, and “All subjects” lets you search for any other.",
      },
      {
        q: "Can I pay in cash?",
        a: "Yes, at the center's counter. The payment is recorded on your account exactly like an online one.",
      },
      {
        q: "Are classes online or at the center?",
        a: "It depends on the group: at the center, live online, or both. You see it before you subscribe, and you can filter by it.",
      },
      {
        q: "I registered at the center and have no account?",
        a: "The front desk registers you and sends your student code on WhatsApp with a secure link to finish your account.",
      },
    ],
  },

  closing: {
    title: "Start from your year and track.",
    body: "Sign up free, and your subjects are in front of you from the first minute.",
    primary: "Sign up free",
    secondary: "I'm a parent",
  },


  roles: {
    label: "By role",
  },

  footer: {
    tagline: "Timetables, attendance and payments for students and parents — from Primary 1 to Secondary 3.",
    platform: "Platform",
    help: "Help",
    legal: "Legal",
    links: {
      pricing: "Pricing",
      faq: "FAQ",
      trust: "Safety",
      contact: "Contact",
      privacy: "Privacy",
      terms: "Terms",
    },
    rights: "All rights reserved.",
  },

  media: {
    reserved: "Reserved",
    play: "Play",
    pause: "Pause",
    counterBoard:
      "The counter board: the running lesson already selected, cash taken and attendance recorded in one step.",
    walkInLoop:
      "A receptionist registers a new student at the counter — name and phone — and inside a minute the student code and the link to hand the guardian are on screen.",
    doorLoop:
      "An assistant at the hall door confirms the students who already passed the counter, one after another, from a phone.",
    studentCard: "The student card on a phone: an eight-character code and a signed QR.",
    roles: "Inside the system",
    roleCenter: "The center's board: today's takings and who still owes.",
    roleTeacher: "A teacher's classes: their groups, each lesson's time, and its status.",
    roleParent: "A parent paying for a lesson or a month from their own wallet.",
    roleStudent: "A student's subjects, assigned from their year and track, and their schedule.",
    roleAssistant: "An assistant recording attendance for a teacher — under the assistant's name.",
    roleStaff: "A receptionist's screen mid-shift — six things, not the owner's console.",
  },
};

const MESSAGES: Record<Locale, Messages> = { ar, en };

export function getMessages(locale: Locale): Messages {
  return MESSAGES[locale];
}

export type { Messages, TeacherCard, TeacherLook, WeekClass };
