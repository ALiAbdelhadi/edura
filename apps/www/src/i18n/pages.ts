import type { Locale } from "./config";

const ar = {
  pricing: {
    meta: {
      title: "الأسعار — لينكتك",
      description:
        "نموذج العمولة في لينكتك: نسبة من الحصة اللي اتسلّمت بس — مفيش اشتراك شهري ولا رسوم إعداد ولا خصم على السحب.",
    },
    label: "الأسعار",
    headline: "مفيش اشتراك. عمولة على الحصة اللي اتسلّمت.",
    lede: "كل جنيه في لينكتك له مسار معروف قبل ما يتحرك. الصفحة دي بتشرح النموذج بالأرقام مش بالكلام العام: نصيب المنصة بيتخصم من الحصة نفسها، بعد ما الفلوس تدخل، ومفيش حاجة بتتضاف على الطالب.",
    note: "الأرقام في المثال توضيحية. النِّسَب الفعلية بتتقري من إعدادات المنصة جوّه النظام، وبتظهرلك قبل أي تأكيد.",
    rules: {
      label: "القواعد",
      title: "ثلاث قواعد تحكم كل عملية.",
      items: [
        {
          title: "السعر اللي الطالب دافعه هو السعر",
          body: "مفيش رسوم بتتضاف على الطالب فوق سعر الدرس أو الاشتراك. نصيب المنصة بيتخصم من الحصة نفسها، بعد ما الفلوس تدخل.",
        },
        {
          title: "النِّسَب بتتجمّد وقت إنشاء المجموعة",
          body: "لما المجموعة تتعمل، نسبتها بتتسجّل عليها وتفضل ثابتة. لو التسعير اتغيّر بعد كده، المجموعات الشغالة ما بتتسعّرش من جديد — التغيير على الجديدة بس.",
        },
        {
          title: "كل قرش له قيد لا يُعدَّل",
          body: "كل تسوية بتكتب قيودها في دفتر مقفول ضد التعديل والحذف على مستوى قاعدة البيانات نفسها. حتى حساب الإدارة العليا ما يقدرش يغيّر قيد اتكتب.",
        },
      ],
    },
    example: {
      label: "مثال",
      title: "حصة في قاعة سنتر، بالأرقام.",
      body: "سعر الحصة بيتقسّم بنسب معلنة: المنصة والسنتر، والباقي كله للمدرّس — محسوب كباقي القسمة بالظبط زي ما المحرّك بيحسبه، فمفيش كسور ضايعة. الحسبة بتتم لكل طالب حاضر فعلًا.",
      teacherDirect: {
        title: "والمدرّس المستقل؟",
        body: "مفيش سنتر في العملية، فمفيش نصيب سنتر: المنصة بتاخد نسبتها وقت الدفع، والباقي بيدخل محفظة المدرّس في نفس اللحظة.",
      },
      perStudent: {
        title: "وقاعة بتتحاسب بالطالب؟",
        body: "بعض القاعات بتتسعّر بمبلغ لكل طالب حاضر بدل نسبة من القاعة كلها. السنتر بيحدد سعر قاعته بحد أقصى معلن من المنصة، والمدرّس بيشوف الرقم على كارت القاعة قبل ما يحجز — مش بعد التسوية.",
      },
    },
    timing: {
      label: "التوقيت",
      title: "إمتى بتوصلك فلوسك؟",
      items: [
        {
          title: "التسوية",
          body: "اشتراك المدرّس المستقل بيتسوّى لحظة نجاح الدفع. حصة السنتر بتتسوّى لما تتقفل، وللطلاب اللي اتسجّل حضورهم بس.",
        },
        {
          title: "المحفظة",
          body: "الصافي بيدخل محفظتك أول بأول، وكل قيد وراه أي حصة وأي طالب — تقدر ترجعله في أي وقت.",
        },
        {
          title: "الصرف",
          body: "بتطلب صرف من الرصيد المتاح، والمبلغ بيتحجز فورًا عشان ما يتطلبش مرتين، وبعدين بيتراجع ويتصرف. مفيش حد أدنى ومفيش خصم على السحب.",
        },
      ],
    },
    noHidden: {
      label: "الوضوح",
      title: "اللي مش بناخده.",
      items: [
        "مفيش رسوم اشتراك شهري على السنتر أو المدرّس.",
        "مفيش رسوم تفعيل ولا رسوم إعداد.",
        "مفيش عمولة على سحب رصيدك من المحفظة.",
        "مفيش رسوم على الطالب فوق سعر الدرس أو الاشتراك.",
        "مفيش عمولة على حصة ما حضرهاش حد — الحسبة بتبدأ من الحضور.",
      ],
    },
    cta: {
      title: "جرّب على أرقامك إنت.",
      body: "التسجيل مجاني ومن غير بطاقة. نصيب المنصة بيبدأ من أول عملية دفع حقيقية — لو ما فيش فلوس اتحركت، مفيش عمولة.",
      primary: "سجّل سنترك",
    },
  },

  faq: {
    meta: {
      title: "أسئلة شائعة — لينكتك",
      description:
        "إجابات مباشرة على أكتر الأسئلة تكرارًا عن لينكتك: الفلوس، الحضور، الصلاحيات، وأمان الطلاب.",
    },
    label: "أسئلة شائعة",
    headline: "الأسئلة اللي بتتكرر.",
    lede: "كل إجابة هنا مكتوبة من سلوك النظام الفعلي، مش من اللي كان نفسنا نوعد بيه.",
    items: [
      {
        q: "لينكتك بتاخد كام؟",
        a: "نسبة من قيمة الدرس أو الاشتراك، بتتخصم بعد ما الفلوس تدخل — مش رسوم شهرية ولا رسوم إعداد. صفحة الأسعار فيها المثال الرقمي بالكامل.",
      },
      {
        q: "إمتى بتدخل الفلوس محفظتي؟",
        a: "اشتراك المدرّس المستقل بيتسوّى لحظة نجاح الدفع. حصة السنتر بتتسوّى لما تتقفل، وللطلاب اللي اتسجّل حضورهم بس.",
      },
      {
        q: "أقدر أسحب رصيدي إمتى؟",
        a: "في أي وقت، من الرصيد المتاح. الطلب بيتحجز من رصيدك فورًا عشان ما ينطلبش مرتين، وبعدين بيتراجع ويتصرف. مفيش حد أدنى ولا خصم على السحب.",
      },
      {
        q: "الكاش بيتسجّل إزاي؟",
        a: "موظف السنتر بيسجّل الدفع على الكاونتر وبيطلع إيصال بمسلسل، والعملية بتتكتب في نفس الدفتر المالي بنفس القيود اللي بيتكتب بيها الدفع الأونلاين.",
      },
      {
        q: "لو طالب سجّل حضور على الكاونتر وما دخلش القاعة؟",
        a: "في وضع الدخولين، تسجيل الكاونتر لوحده بيتسجّل كحالة منفصلة ما بتتحسبش حضور، وبيظهر للمدرّس بوضوح. وبما إنه مش حضور، الحصة دي ما بتتسوّاش على الطالب ده.",
      },
      {
        q: "المساعد بتاعي يقدر يعمل إيه؟",
        a: "كل حاجة إنت بتعملها ما عدا المحفظة والصرف والإعدادات المالية وإدارة المساعدين نفسهم. وكل عملية بتتسجّل باسمه ومكتوب إنها تمت نيابة عنك.",
      },
      {
        q: "ولي الأمر بيشوف محادثات ابنه؟",
        a: "بيشوف محادثات ابنه القاصر مع البالغين، للقراءة فقط، ومن غير ما يأثر على علامات القراءة. الطرفين بيشوفوا تنبيه دائم إن الاطّلاع ده مفعّل — مفيش مراقبة خفية.",
      },
      {
        q: "بيانات سنتري محمية إزاي من السناتر التانية؟",
        a: "العزل بيتفرض على مستوى قاعدة البيانات نفسها، مش على مستوى الشاشات بس. طلب من سنتر ما يقدرش يقرأ صف بيخص سنتر تاني حتى لو حد جرّب.",
      },
      {
        q: "لينكتك بتشتغل على الموبايل؟",
        a: "أيوه، من المتصفح مباشرة من غير تثبيت، وممكن تتثبّت كتطبيق على الشاشة الرئيسية. الحضور بيشتغل حتى لو النت فصل ويتزامن لما يرجع.",
      },
      {
        q: "أقدر أجرّب قبل ما أدفع؟",
        a: "التسجيل مجاني ومن غير بطاقة. نصيب المنصة بيبدأ من أول عملية دفع حقيقية بس — لو ما فيش فلوس اتحركت، مفيش عمولة.",
      },
    ],
    more: {
      title: "لسه عندك سؤال؟",
      body: "صفحة الضمانات بتشرح آليات الحماية نفسها، وصفحة الأسعار فيها الحسبة بالأرقام.",
      pricing: "الأسعار",
      trust: "الضمانات",
    },
  },

  trust: {
    meta: {
      title: "الثقة والأمان — لينكتك",
      description:
        "كل جملة في الصفحة دي بتشاور على آلية في قاعدة البيانات أو في الكود، مش على وثيقة سياسات: دفتر لا يُمحى، عزل السناتر، حماية القُصّر، الجلسات، والتحليلات.",
    },
    label: "الثقة والأمان",
    headline: "الواجهة بتقول الحقيقة عن اللي النظام بيضمنه.",
    lede: "كل جملة في الصفحة دي بتشاور على آلية في قاعدة البيانات أو في الكود، مش على وثيقة سياسات.",
    sections: [
      {
        id: "append",
        label: "ما بيتعدّلش",
        title: "جداول التطبيق نفسه ما يقدرش يعيد كتابتها.",
        body: "المعاملات والنقاط وسجل التدقيق والتسويات إدخال وقراءة بس — لا تُعدَّل ولا تُمحى. الفواتير والمسحوبات وسجل الحظر ما بيتمسحوش. وحتى الإدارة العليا مش مستثناة: التطبيقات كلها بتتصل بنفس دور قاعدة البيانات المحدود، والتصحيح بيتكتب كقيد جديد والقيد الغلط بيفضل ظاهر.",
      },
      {
        id: "isolation",
        label: "العزل",
        title: "سنتر ما يقدرش يقرأ بيانات سنتر تاني.",
        body: "مفروض بسياسات أمان على مستوى الصف جوّه PostgreSQL نفسها، مش بشرط في كود التطبيق. الاستعلام اللي ينسى الفلتر بيرجع لا شيء، مش كل حاجة.",
      },
      {
        id: "minors",
        label: "القُصّر",
        title: "القاصر هو الافتراض، في كل مكان بيفرق.",
        body: "شرط إيجابي واحد بيحدد البلوغ: تاريخ ميلاد موجود ومُوثَّق وسن ١٨ فأكثر. فالحقل الناقص أو التاريخ غير الموثّق عمره ما يفتح حساب طفل بالغلط — ومراسلة الكبار بتفضل مقفولة لحد ما وصول ولي الأمر يتأكّد، من غير ما يتوقف درس ولا دفعة ولا دخول.",
      },
      {
        id: "sessions",
        label: "الجلسات",
        title: "إيقاف الحساب بينهي الجلسة في نفس الأمر.",
        body: "مُشغّل جوّه قاعدة البيانات بيمسح جلسات المستخدم أول ما حالته تتغيّر أو حسابه يتحذف — فبيشتغل حتى مع أوامر ما مرّتش على التطبيق أصلًا. وتغيير كلمة المرور بينهي الجلسات القديمة على كل الأجهزة.",
      },
      {
        id: "analytics",
        label: "التحليلات",
        title: "معرّفات بس، والقُصّر ما بيتحددوش خالص.",
        body: "مفيش اسم ولا إيميل ولا رقم ولا أي حاجة كتبها إنسان بتوصل لأي مزوّد تحليلات. تسجيل الجلسات والالتقاط التلقائي مقفولين، والرموز أحادية الاستخدام بتتشال قبل ما أي خطأ يخرج من المتصفح.",
      },
    ],
    links: {
      title: "اقرأ الأصل.",
      body: "الآليات دي هي اللي السياسات بتوصفها — والسياسات نفسها هنا.",
      privacy: "سياسة الخصوصية",
      terms: "شروط الاستخدام",
    },
  },

  legal: {
    privacyTitle: "سياسة الخصوصية",
    termsTitle: "شروط الاستخدام",
    updated: "آخر تحديث",
    privacyUpdated: "٢ أغسطس ٢٠٢٦",
    termsUpdated: "١ أغسطس ٢٠٢٦",
  },
  contact: {
    meta: {
      title: "تواصل معنا — لينكتك",
      description:
        "اسأل عن عرض توضيحي، الأسعار، الدعم، أو شراكة. وللمسائل العاجلة الخاصة بحساب أو طالب، السنتر بتاعك أسرع منّا.",
    },
    label: "تواصل",
    headline: "قولنا انت مين، ونرد على قد سؤالك.",
    lede: "الرسايل بتوصل لصندوق واحد جوّه النظام، وبتترد بالترتيب. اختار الموضوع الصح عشان توصل للشخص الصح من أول مرة.",

    routes: {
      label: "أسرع طريق لسؤالك",
      items: [
        {
          title: "عندك حساب ومحتاج حاجة دلوقتي؟",
          body: "ادخل على حسابك واستخدم الرسائل جوّه النظام. هناك إحنا عارفين انت مين ومع أنهي سنتر، فالرد بيبقى أسرع وأدق — من غير ما تكتب بياناتك تاني في صفحة عامة.",
          cta: "روح لحسابك",
          kind: "app",
        },
        {
          title: "سؤال عن طالب: حضور، دفعة، أو كارنيه؟",
          body: "كلّم السنتر بتاعك على طول. البيانات دي عندهم هُم، وإحنا ما بنقدرش نناقش تفاصيل طالب مع حد مش مثبت إنه صاحب الحساب أو وليّ أمره.",
          cta: null,
          kind: "center",
        },
        {
          title: "أي حاجة تانية",
          body: "الفورم تحت. اختار الموضوع وهنرد على الإيميل اللي هتكتبه.",
          cta: null,
          kind: "form",
        },
      ],
    },

    form: {
      label: "الفورم",
      title: "ابعتلنا رسالة.",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "رقم الموبايل (اختياري)",
      subject: "الموضوع",
      message: "رسالتك",
      submit: "ابعت",
      sending: "بيتبعت…",
      subjects: {
        demo: "عرض توضيحي",
        pricing: "سؤال عن الأسعار",
        support: "دعم فني",
        partnership: "شراكة",
        other: "موضوع تاني",
      },
      optionalHint: "اختياري",
      minMessage: "اكتب 10 حروف على الأقل.",
      badEmail: "دقّق البريد الإلكتروني.",
      ok: {
        title: "وصلت.",
        body: "هنرد على البريد اللي كتبته. لو الموضوع عاجل ومرتبط بطالب، كلّم السنتر بتاعك — أسرع.",
      },
      failed: "ما قدرناش نبعتها دلوقتي. جرّب تاني بعد شوية.",
      limited: "بعتّ رسايل كتير في وقت قصير. استنى دقيقة وجرّب تاني.",
    },

    safety: {
      title: "متبعتش بيانات طالب هنا.",
      body: "الصفحة دي عامة ومش مربوطة بحسابك. متكتبش اسم طالب كامل، رقم قومي، عنوان، أو أي بيانات دفع. لو محتاج تناقش طالب بعينه، استخدم الرسائل جوّه النظام أو كلّم السنتر.",
    },

    note: "الرد بيتبعت على البريد اللي بتكتبه. لسه مفيش وعد بزمن رد محدد.",

    reach: {
      label: "بيانات التواصل",
      phoneLabel: "تليفون",
      phone: "+20 100 000 0000",
      addressLabel: "العنوان",
      address: "القاهرة، مصر",
      placeholderNote: "بيانات مؤقتة لحد ما تتأكّد البيانات الرسمية.",
    },
  },
};

type Pages = typeof ar;

const en: Pages = {
  pricing: {
    meta: {
      title: "Pricing — Linktich",
      description:
        "Linktich's commission model: a share of delivered lessons only — no monthly subscription, no setup fee, no withdrawal fee.",
    },
    label: "Pricing",
    headline: "No subscription. Commission on delivered lessons.",
    lede: "Every pound in Linktich has a known path before it moves. This page explains the model in numbers, not adjectives: the platform's share is deducted from the lesson itself, after the money has come in, and nothing is added on top of the student's price.",
    note: "The figures in the example are illustrative. The actual rates are read from the platform's own settings inside the system, and are shown to you before any confirmation.",
    rules: {
      label: "The rules",
      title: "Three rules govern every transaction.",
      items: [
        {
          title: "What the student pays is the price",
          body: "Nothing is added on top of a lesson or subscription price. The platform's share is deducted from the lesson itself, after the money has come in.",
        },
        {
          title: "Rates freeze when the group is created",
          body: "A group records its rates the moment it is created, and keeps them. If pricing changes later, running groups are never re-rated — the change applies to new ones only.",
        },
        {
          title: "Every pound leaves an entry that cannot be edited",
          body: "Each settlement writes its entries into a ledger closed against updates and deletes at the database level itself. Not even a back-office account can alter an entry once written.",
        },
      ],
    },
    example: {
      label: "Example",
      title: "A lesson in a center's hall, in numbers.",
      body: "The lesson price splits at published rates: platform and center, with the whole remainder going to the teacher — derived exactly as the engine derives it, so no rounding leaks. The calculation runs per student who actually attended.",
      teacherDirect: {
        title: "And an independent teacher?",
        body: "No center is involved, so there is no center share: the platform takes its commission at payment time, and the remainder lands in the teacher's wallet in the same moment.",
      },
      perStudent: {
        title: "And a hall priced per student?",
        body: "Some halls are priced as an amount per attending student instead of a share of the whole room. The center sets its own hall's rate, capped by the platform's published ceiling, and the teacher sees the number on the hall card before booking — not after settlement.",
      },
    },
    timing: {
      label: "Timing",
      title: "When does the money reach you?",
      items: [
        {
          title: "Settlement",
          body: "An independent teacher's subscription settles the moment payment succeeds. A center lesson settles when it closes, and only for the students whose attendance was recorded.",
        },
        {
          title: "Wallet",
          body: "The net lands in your wallet as it is earned, and every entry names the session and the student behind it — you can trace it back at any time.",
        },
        {
          title: "Payout",
          body: "You request a payout from your available balance; the amount is reserved immediately so it cannot be requested twice, then reviewed and paid. No minimum, no withdrawal fee.",
        },
      ],
    },
    noHidden: {
      label: "Plainly",
      title: "What we don't charge.",
      items: [
        "No monthly platform subscription for a center or a teacher.",
        "No activation or setup fee.",
        "No fee for withdrawing your own wallet balance.",
        "Nothing charged to the student on top of the lesson or subscription price.",
        "No commission on a session nobody attended — the calculation starts at attendance.",
      ],
    },
    cta: {
      title: "Try it on your own numbers.",
      body: "Signing up is free and needs no card. The platform's share only begins at the first real payment — if no money moved, there is no commission.",
      primary: "Register your center",
    },
  },

  faq: {
    meta: {
      title: "FAQ — Linktich",
      description:
        "Direct answers to the most common questions about Linktich: money, attendance, permissions and student safety.",
    },
    label: "FAQ",
    headline: "The questions we hear most.",
    lede: "Every answer here is written from real system behaviour, not from what would have been nice to promise.",
    items: [
      {
        q: "How much does Linktich take?",
        a: "A share of the lesson or subscription value, deducted after the money comes in — not a monthly fee and not a setup fee. The pricing page has the full worked example.",
      },
      {
        q: "When does money reach my wallet?",
        a: "An independent teacher's subscription settles the moment payment succeeds. A center lesson settles when it closes, and only for the students whose attendance was recorded.",
      },
      {
        q: "When can I withdraw?",
        a: "Any time, from your available balance. The request reserves the amount immediately so it cannot be requested twice, then it is reviewed and paid. No minimum, no withdrawal fee.",
      },
      {
        q: "How is cash recorded?",
        a: "Center staff record the payment at the counter and issue a numbered receipt, and it is written to the same ledger with the same entries as an online payment.",
      },
      {
        q: "What if a student checks in at the counter but never enters the hall?",
        a: "In two-stage mode a counter check-in on its own is recorded as a distinct state that does not count as attendance, and it is flagged plainly to the teacher. Because it is not attendance, that lesson does not settle for that student.",
      },
      {
        q: "What can my assistant do?",
        a: "Everything you can do except the wallet, payouts, financial settings, and managing assistants. Every action is recorded under their name and marked as done on your behalf.",
      },
      {
        q: "Can a parent see their child's messages?",
        a: "They can see their minor child's threads with adults, read-only, without touching read receipts. Both sides see a permanent notice that the oversight is active — there is no hidden monitoring.",
      },
      {
        q: "How is my center's data protected from other centers?",
        a: "Isolation is enforced in the database itself, not only in the screens. A request from one center cannot read a row belonging to another, even if someone tried.",
      },
      {
        q: "Does Linktich work on mobile?",
        a: "Yes, straight from the browser with no install, and it can be added to the home screen as an app. Attendance keeps working when the connection drops and syncs when it returns.",
      },
      {
        q: "Can I try it before paying?",
        a: "Signing up is free and needs no card. The platform's share only begins at the first real payment — if no money moved, there is no commission.",
      },
    ],
    more: {
      title: "Still have a question?",
      body: "The guarantees page explains the protection mechanisms themselves, and the pricing page has the arithmetic.",
      pricing: "Pricing",
      trust: "Guarantees",
    },
  },

  trust: {
    meta: {
      title: "Trust & safety — Linktich",
      description:
        "Every claim on this page points at a mechanism in the database or the code, not at a policy document: an unerasable ledger, center isolation, protection of minors, sessions, and analytics.",
    },
    label: "Trust & safety",
    headline: "The interface tells the truth about what the software guarantees.",
    lede: "Every claim on this page points at a mechanism in the database or the code, not at a policy document.",
    sections: [
      {
        id: "append",
        label: "Append-only",
        title: "Tables the application itself cannot rewrite.",
        body: "Transactions, points, the audit log and settlements are INSERT and SELECT only — never edited, never erased. Invoices, payouts and the blacklist journal cannot be deleted. Not even the back office is exempt: every app connects as the same restricted database role, a correction is written as a new entry, and the wrong one stays visible.",
      },
      {
        id: "isolation",
        label: "Isolation",
        title: "One center cannot read another's rows.",
        body: "Enforced by row-level security policies inside PostgreSQL itself, not by an if-statement in application code. A query that forgets its filter returns nothing rather than everything.",
      },
      {
        id: "minors",
        label: "Minors",
        title: "Minor is the default, everywhere it matters.",
        body: "One positive condition decides adulthood: a date of birth that exists, is verified, and puts them at 18 or over. A missing field or an unverified date can never silently unlock a child's account — and adult-facing messaging stays locked until a guardian channel is confirmed, without stopping a single lesson, payment or sign-in.",
      },
      {
        id: "sessions",
        label: "Sessions",
        title: "Deactivation ends a session in the same statement.",
        body: "A database trigger deletes a user's sessions the moment their status changes or their account is removed — so it holds even for statements that never went through the application. And changing a password ends old sessions on every device.",
      },
      {
        id: "analytics",
        label: "Analytics",
        title: "IDs only, and minors are never identified at all.",
        body: "No name, email, phone or anything a human typed reaches an analytics vendor. Session replay and autocapture are off, and single-use tokens are redacted before an error ever leaves the browser.",
      },
    ],
    links: {
      title: "Read the real thing.",
      body: "These mechanisms are what the policies describe — and the policies themselves are here.",
      privacy: "Privacy policy",
      terms: "Terms of service",
    },
  },

  legal: {
    privacyTitle: "Privacy Policy",
    termsTitle: "Terms of Service",
    updated: "Last updated",
    privacyUpdated: "August 2, 2026",
    termsUpdated: "August 1, 2026",
  },
  contact: {
    meta: {
      title: "Contact — Linktich",
      description:
        "Ask about a demo, pricing, support, or a partnership. For anything urgent about an account or a student, your center is faster than we are.",
    },
    label: "Contact",
    headline: "Tell us who you are, and we'll answer the question you asked.",
    lede: "Messages land in one inbox inside the system and are worked in order. Picking the right subject is what gets you to the right person first time.",

    routes: {
      label: "Fastest route",
      items: [
        {
          title: "Have an account and need something now?",
          body: "Sign in and use the messages inside the system. There we already know who you are and which center you are with, so the answer is faster and more accurate — and you do not retype your details into a public page.",
          cta: "Go to your account",
          kind: "app",
        },
        {
          title: "A question about a student — attendance, a payment, a card?",
          body: "Talk to your center directly. They hold that information, and we cannot discuss a student's details with anyone who is not verified as the account holder or their guardian.",
          cta: null,
          kind: "center",
        },
        {
          title: "Anything else",
          body: "The form below. Pick a subject and we will reply to the address you give.",
          cta: null,
          kind: "form",
        },
      ],
    },

    form: {
      label: "The form",
      title: "Send us a message.",
      name: "Name",
      email: "Email",
      phone: "Mobile number (optional)",
      subject: "Subject",
      message: "Your message",
      submit: "Send",
      sending: "Sending…",
      subjects: {
        demo: "A demo",
        pricing: "A pricing question",
        support: "Support",
        partnership: "Partnership",
        other: "Something else",
      },
      optionalHint: "optional",
      minMessage: "Write at least 10 characters.",
      badEmail: "Check the email address.",
      ok: {
        title: "Received.",
        body: "We will reply to the address you gave. If it is urgent and about a student, your center is faster.",
      },
      failed: "We could not send it just now. Try again in a moment.",
      limited: "That is a lot of messages in a short time. Wait a minute and try again.",
    },

    safety: {
      title: "Do not send a student's details here.",
      body: "This page is public and not tied to your account. Do not write a student's full name, national ID, address, or any payment details. To discuss a specific student, use the messages inside the system or talk to the center.",
    },

    note: "We reply to the address you give. There is no committed response time yet.",

    reach: {
      label: "Reach us",
      phoneLabel: "Phone",
      phone: "+20 100 000 0000",
      addressLabel: "Address",
      address: "Cairo, Egypt",
      placeholderNote: "Temporary details, pending the official ones.",
    },
  },
};

const PAGES: Record<Locale, Pages> = { ar, en };

export function getPages(locale: Locale): Pages {
  return PAGES[locale];
}

export type { Pages };
