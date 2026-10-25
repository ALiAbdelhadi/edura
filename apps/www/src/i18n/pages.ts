import type { Locale } from "./config";

const ar = {
  pricing: {
    meta: {
      title: "الأسعار — لينكتك",
      description:
        "بتدفع الحصة لوحدها أو الشهر كله، بسعر المدرّس من غير رسوم فوقه. والدفع بالكارت أو محفظة الموبايل أو كاش في السنتر أو من محفظة ولي الأمر.",
    },
    headline: "سعر الحصة بيحطه المدرّس. والتسجيل ببلاش.",
    lede: "بتدفع الحصة لوحدها أو الشهر كله، بنفس السعر اللي المدرّس حاطه. مفيش رسوم بتتضاف عليك.",
    plans: {
      title: "اختار تدفع إزاي.",
      items: [
        {
          id: "lesson",
          name: "بالحصة",
          price: "سعر المدرّس",
          per: "للحصة الواحدة",
          points: [
            "بتدفع كل حصة لوحدها.",
            "بتدفع على قد الحصص اللي بتاخدها.",
            "مفيش رسوم فوق سعر الحصة.",
          ],
        },
        {
          id: "month",
          name: "بالشهر",
          price: "سعر المدرّس",
          per: "للشهر",
          points: [
            "اشتراك شهري في المجموعة.",
            "بتجدّده بنفسك كل شهر.",
            "مفيش رسوم فوق سعر الاشتراك.",
          ],
        },
      ],
      note: "كل مجموعة بتقولك قبل ما تشترك: بالحصة ولا بالشهر، وبكام.",
      primary: "سجّل كطالب",
    },
    methods: {
      title: "تدفع إزاي؟",
      items: [
        {
          title: "كارت أو محفظة موبايل",
          body: "أونلاين عن طريق Paymob. رقم الكارت مش بيتخزّن عندنا.",
        },
        {
          title: "كاش في السنتر",
          body: "على الكاونتر، وبتاخد إيصال بمسلسل. الدفعة بتتسجّل في حسابك زي الأونلاين بالظبط.",
        },
        {
          title: "محفظة ولي الأمر",
          body: "ولي الأمر يدفع الحصة من محفظته، والاشتراك يفضل باسم الطالب.",
        },
      ],
    },
    more: {
      title: "لسه عندك سؤال؟",
      faq: "الأسئلة الشائعة",
      contact: "تواصل معنا",
    },
  },

  faq: {
    meta: {
      title: "أسئلة شائعة — لينكتك",
      description:
        "إجابات قصيرة للطالب وولي الأمر: التسجيل، الدفع، الحضور، المراسلة، وأمان الطلاب.",
    },
    headline: "الأسئلة اللي بتتكرر.",
    lede: "إجابات قصيرة، من اللي النظام بيعمله فعلًا.",
    groups: [
      {
        id: "students",
        title: "للطالب",
        items: [
          {
            q: "التسجيل بفلوس؟",
            a: "لا. التسجيل مجاني للطالب ولولي الأمر. بتدفع بس الحصة أو الشهر اللي بتشترك فيه، بسعر المدرّس.",
          },
          {
            q: "لو عايز مادة مش في شعبتي؟",
            a: "موادك بتظهر من سنتك وشعبتك، وفيه وضع «كل المواد» تدوّر فيه على أي مادة.",
          },
          {
            q: "الاشتراك بالشهر ولا بالحصة؟",
            a: "حسب المجموعة: اشتراك شهري بتجدّده بنفسك، أو حصة بحصة. السعر هو سعر المدرّس، ومفيش رسوم بتتضاف عليه.",
          },
          {
            q: "ينفع أدفع كاش؟",
            a: "أيوه، على كاونتر السنتر، والدفعة بتتسجّل في حسابك زي الأونلاين بالظبط. والأونلاين بالكارت أو محفظة الموبايل عن طريق Paymob.",
          },
          {
            q: "الحصص أونلاين ولا في السنتر؟",
            a: "حسب المجموعة: في السنتر، أونلاين لايف، أو الاتنين. بيبان قبل ما تشترك، وتقدر تفلتر بيه.",
          },
          {
            q: "اتسجّلت في السنتر ومعييش حساب؟",
            a: "موظف الاستقبال بيسجّلك، وبيوصلك على واتساب كود الطالب ورابط آمن تكمّل بيه حسابك.",
          },
          {
            q: "كود الطالب فيه بياناتي؟",
            a: "لا. الكود ٨ خانات ومعاه QR على الكارنيه، ومش مبني على اسمك ولا تاريخ ميلادك ولا تليفونك. وفيه خانة تحقق بتمسك أي غلطة في كتابته.",
          },
          {
            q: "بيشتغل على الموبايل؟",
            a: "أيوه، من المتصفح على طول من غير تثبيت، وممكن تضيفه على الشاشة الرئيسية كتطبيق. والحضور بيشتغل حتى لو النت فصل، ويتزامن لما يرجع.",
          },
        ],
      },
      {
        id: "parents",
        title: "لولي الأمر",
        items: [
          {
            q: "ولي الأمر يقدر يدفع عن ابنه؟",
            a: "أيوه، من محفظته هو. الاشتراك بيفضل باسم الطالب، وولي الأمر بيتابع حضوره ومدفوعاته من حسابه.",
          },
          {
            q: "ليه ابني مش قادر يراسل المدرّس؟",
            a: "أي طالب تحت ١٨، أو سنّه مش متوثّق، بيتعامل كقاصر. مراسلته مع الكبار بتفضل مقفولة لحد ما إيميل ولي أمره يتأكد — رقم التليفون لوحده مش كفاية. الحصص والحضور والدفع شغالين عادي في الوقت ده.",
          },
          {
            q: "ولي الأمر بيشوف محادثات ابنه؟",
            a: "بيشوف محادثات ابنه القاصر مع الكبار، للقراءة بس، ومن غير ما يأثر على علامات القراءة. والطرفين بيشوفوا تنبيه دايم إن ده مفعّل — مفيش مراقبة خفية.",
          },
        ],
      },
    ],
    more: {
      title: "لسه عندك سؤال؟",
      body: "ابعتلنا، وهنرد على إيميلك.",
      contact: "تواصل معنا",
      trust: "الثقة والأمان",
    },
  },

  trust: {
    meta: {
      title: "الثقة والأمان — لينكتك",
      description:
        "أمان الطلاب، الفلوس، والبيانات: كل سطر وراه حاجة في الكود أو في قاعدة البيانات، مش وعد في ورقة.",
    },
    headline: "اللي مكتوب هنا، النظام بيعمله فعلًا.",
    lede: "كل سطر في الصفحة دي وراه حاجة في الكود أو في قاعدة البيانات، مش وعد في ورقة.",
    groups: [
      {
        id: "students",
        title: "أمان الطلاب",
        items: [
          {
            title: "أي طالب قاصر، لحد ما يثبت العكس",
            body: "البلوغ شرط واحد: تاريخ ميلاد موجود ومتوثّق وسن ١٨ أو أكتر. أي حاجة ناقصة أو مش متوثّقة، يبقى قاصر.",
          },
          {
            title: "مراسلة الكبار مقفولة لحد ما إيميل ولي الأمر يتأكد",
            body: "رقم التليفون لوحده مش كفاية. والحصص والحضور والدفع شغالين عادي في الوقت ده.",
          },
          {
            title: "ولي الأمر بيقرا، والطرفين عارفين",
            body: "ولي الأمر المرتبط بيشوف محادثات ابنه مع الكبار للقراءة بس، وفيه تنبيه دايم للطرفين.",
          },
          {
            title: "كود الطالب مافيهوش بيانات شخصية",
            body: "متولّد من بصمة SHA-256 لمعرّف الحساب، مش من الاسم ولا الميلاد ولا التليفون. والـQR اللي على الكارنيه ما بيفتحش جلسة لحد.",
          },
        ],
      },
      {
        id: "money",
        title: "الفلوس",
        items: [
          {
            title: "كل جنيه له قيد ما بيتعدّلش",
            body: "المعاملات والتسويات وسجل التدقيق إدخال وقراءة بس. التصحيح بيتكتب قيد جديد، والقيد الغلط بيفضل ظاهر — والإدارة نفسها مش مستثناة.",
          },
          {
            title: "رقم الكارت مش عندنا",
            body: "الدفع بالكارت والمحفظة بيتم على صفحات Paymob. إحنا بنحتفظ بسجل العملية بس: المبلغ والوقت والحالة.",
          },
          {
            title: "الكاش ليه إيصال",
            body: "دفع الكاونتر بيطلع إيصال بمسلسل، وبيتسجّل في نفس الدفتر زي الدفع الأونلاين.",
          },
        ],
      },
      {
        id: "data",
        title: "البيانات",
        items: [
          {
            title: "سنتر ما يقدرش يقرا بيانات سنتر تاني",
            body: "العزل جوّه PostgreSQL نفسها، بسياسات على مستوى الصف. الاستعلام اللي ينسى الفلتر بيرجع ولا حاجة، مش كل حاجة.",
          },
          {
            title: "إيقاف الحساب بيقفل جلساته فورًا",
            body: "مُشغّل في قاعدة البيانات بيمسح الجلسات أول ما حالة الحساب تتغيّر. وتغيير كلمة المرور بيقفل الجلسات القديمة على كل الأجهزة.",
          },
          {
            title: "التحليلات بمعرّفات بس",
            body: "مفيش اسم ولا إيميل ولا رقم بيوصل لأي مزوّد تحليلات، والقُصّر ما بيتحددوش خالص. تسجيل الجلسات مقفول.",
          },
        ],
      },
    ],
    links: {
      title: "اقرا السياسات نفسها.",
      privacy: "سياسة الخصوصية",
      terms: "شروط الاستخدام",
    },
  },

  legal: {
    privacyTitle: "سياسة الخصوصية",
    termsTitle: "شروط الاستخدام",
    updated: "آخر تحديث",
    contents: "المحتويات",
    privacyUpdated: "٢ أغسطس ٢٠٢٦",
    termsUpdated: "١ أغسطس ٢٠٢٦",
  },

  contact: {
    meta: {
      title: "تواصل معنا — لينكتك",
      description:
        "اسأل عن الأسعار أو الدعم أو أي حاجة تانية. ولو الموضوع عاجل ويخص طالب، السنتر بتاعه أسرع.",
    },
    headline: "قولنا محتاج إيه، ونرد عليك.",
    lede: "اختار الطريق الأقرب لسؤالك، أو ابعتلنا من الفورم.",

    routes: {
      title: "توصلنا إزاي",
      items: [
        {
          title: "عندك حساب؟",
          body: "ادخل وابعت من الرسائل جوّه حسابك. أسرع، ومن غير ما تكتب بياناتك في صفحة عامة.",
          cta: "روح لحسابك",
        },
        {
          title: "سؤال عن طالب؟",
          body: "كلّم السنتر بتاعه على طول. الحضور والدفع والكارنيه عندهم.",
          cta: null,
        },
        {
          title: "أي حاجة تانية",
          body: "ابعتلنا من الفورم، وهنرد على الإيميل اللي هتكتبه.",
          cta: null,
        },
      ],
    },

    safety: {
      title: "متكتبش بيانات طالب هنا.",
      body: "الصفحة دي عامة. متكتبش اسم طالب كامل ولا رقم قومي ولا عنوان ولا بيانات دفع.",
    },

    note: "الرد بيوصل على الإيميل اللي بتكتبه. لسه مفيش وعد بمدة رد محددة.",

    form: {
      title: "ابعتلنا رسالة",
      name: "الاسم",
      email: "البريد الإلكتروني",
      phone: "رقم الموبايل (اختياري)",
      subject: "الموضوع",
      message: "رسالتك",
      submit: "ابعت",
      sending: "بيتبعت…",
      subjects: {
        pricing: "سؤال عن الأسعار",
        support: "دعم فني",
        other: "موضوع تاني",
      },
      badName: "اكتب اسمك.",
      badEmail: "دقّق البريد الإلكتروني.",
      minMessage: "اكتب ١٠ حروف على الأقل.",
      ok: {
        title: "وصلت.",
        body: "هنرد على الإيميل اللي كتبته. لو الموضوع عاجل ويخص طالب، كلّم السنتر بتاعه — أسرع.",
      },
      failed: "ما قدرناش نبعتها دلوقتي. جرّب تاني بعد شوية.",
      limited: "بعتّ رسايل كتير في وقت قصير. استنى دقيقة وجرّب تاني.",
    },
  },

  notFound: {
    meta: "الصفحة مش موجودة — لينكتك",
    title: "الصفحة دي مش هنا.",
    body: "ممكن الرابط فيه غلطة، أو الصفحة اتنقلت.",
    home: "ارجع للرئيسية",
  },
};

type Pages = typeof ar;

const en: Pages = {
  pricing: {
    meta: {
      title: "Pricing — Linktich",
      description:
        "Pay per lesson or by the month, at the teacher's price with nothing on top. Pay by card or mobile wallet, in cash at the center, or from a parent's wallet.",
    },
    headline: "The teacher sets the price. Signing up is free.",
    lede: "Pay for one lesson or the whole month, at the price the teacher set. Nothing is added on top.",
    plans: {
      title: "Choose how you pay.",
      items: [
        {
          id: "lesson",
          name: "Per lesson",
          price: "The teacher's price",
          per: "for one lesson",
          points: [
            "You pay for each lesson on its own.",
            "You pay only for the lessons you take.",
            "Nothing on top of the lesson price.",
          ],
        },
        {
          id: "month",
          name: "Monthly",
          price: "The teacher's price",
          per: "for the month",
          points: [
            "A monthly subscription to the group.",
            "You renew it yourself each month.",
            "Nothing on top of the subscription price.",
          ],
        },
      ],
      note: "Every group tells you before you subscribe: per lesson or monthly, and how much.",
      primary: "Sign up as a student",
    },
    methods: {
      title: "How do you pay?",
      items: [
        {
          title: "Card or mobile wallet",
          body: "Online through Paymob. Card numbers are never stored with us.",
        },
        {
          title: "Cash at the center",
          body: "At the counter, with a numbered receipt. The payment lands on your account exactly like an online one.",
        },
        {
          title: "Parent's wallet",
          body: "A parent pays for the lesson from their own wallet, and the subscription stays in the student's name.",
        },
      ],
    },
    more: {
      title: "Still have a question?",
      faq: "FAQ",
      contact: "Contact us",
    },
  },

  faq: {
    meta: {
      title: "FAQ — Linktich",
      description:
        "Short answers for students and parents: sign-up, payment, attendance, messaging and student safety.",
    },
    headline: "The questions we hear most.",
    lede: "Short answers, taken from what the system actually does.",
    groups: [
      {
        id: "students",
        title: "For students",
        items: [
          {
            q: "Does signing up cost anything?",
            a: "No. Sign-up is free for students and parents. You only pay for the lesson or month you subscribe to, at the teacher's price.",
          },
          {
            q: "What if I want a subject outside my track?",
            a: "Your subjects come from your year and track, and the “All subjects” mode lets you search for any subject.",
          },
          {
            q: "Is it monthly or per lesson?",
            a: "It depends on the group: a monthly subscription you renew yourself, or lesson by lesson. The price is the teacher's price, with nothing added on top.",
          },
          {
            q: "Can I pay in cash?",
            a: "Yes, at the center's counter, and the payment is recorded on your account exactly like an online one. Online means a card or a mobile wallet through Paymob.",
          },
          {
            q: "Are classes online or at the center?",
            a: "It depends on the group: at the center, live online, or both. You see it before you subscribe, and you can filter by it.",
          },
          {
            q: "I registered at the center and have no account?",
            a: "The front desk registers you and sends your student code on WhatsApp with a secure link to finish your account.",
          },
          {
            q: "Does the student code contain my details?",
            a: "No. The code is 8 characters with a QR on the card, and it is not built from your name, birth date or phone number. Its check character catches any typo.",
          },
          {
            q: "Does it work on mobile?",
            a: "Yes, straight from the browser with no install, and you can add it to your home screen as an app. Attendance keeps working when the connection drops and syncs when it returns.",
          },
        ],
      },
      {
        id: "parents",
        title: "For parents",
        items: [
          {
            q: "Can a parent pay for their child?",
            a: "Yes, from their own wallet. The subscription stays in the student's name, and the parent follows attendance and payments from their own account.",
          },
          {
            q: "Why can't my child message the teacher?",
            a: "Any student under 18, or whose age is not verified, is treated as a minor. Their messaging with adults stays locked until a parent's email is confirmed — a phone number alone is not enough. Lessons, check-ins and payments carry on as normal meanwhile.",
          },
          {
            q: "Can a parent see their child's messages?",
            a: "They can see their minor child's threads with adults, read-only, without touching read receipts. Both sides see a permanent notice that this is on — there is no hidden monitoring.",
          },
        ],
      },
    ],
    more: {
      title: "Still have a question?",
      body: "Send us a message and we'll reply by email.",
      contact: "Contact us",
      trust: "Trust & safety",
    },
  },

  trust: {
    meta: {
      title: "Trust & safety — Linktich",
      description:
        "Student safety, money and data: every line points at something in the code or the database, not at a promise on paper.",
    },
    headline: "What it says here is what the system does.",
    lede: "Every line on this page points at something in the code or the database, not at a promise on paper.",
    groups: [
      {
        id: "students",
        title: "Student safety",
        items: [
          {
            title: "Every student is a minor until shown otherwise",
            body: "Adulthood is one condition: a date of birth that exists, is verified, and puts them at 18 or over. Anything missing or unverified means minor.",
          },
          {
            title: "Messaging with adults stays locked until a parent's email is confirmed",
            body: "A phone number alone is not enough. Lessons, check-ins and payments carry on as normal meanwhile.",
          },
          {
            title: "Parents can read, and both sides know",
            body: "A linked parent can read their child's threads with adults, read-only, with a permanent notice on both sides.",
          },
          {
            title: "The student code carries no personal data",
            body: "It is derived from a SHA-256 of the account's id — never from a name, birth date or phone number. The QR on the card opens no session for anyone.",
          },
        ],
      },
      {
        id: "money",
        title: "Money",
        items: [
          {
            title: "Every pound leaves an entry that cannot be edited",
            body: "Transactions, settlements and the audit log are insert and read only. A correction is written as a new entry and the wrong one stays visible — the back office is not exempt.",
          },
          {
            title: "We never hold card numbers",
            body: "Card and wallet payments happen on Paymob's pages. We keep only the record of the payment: amount, time and status.",
          },
          {
            title: "Cash gets a receipt",
            body: "A counter payment issues a numbered receipt and is written to the same ledger as an online payment.",
          },
        ],
      },
      {
        id: "data",
        title: "Data",
        items: [
          {
            title: "One center cannot read another's data",
            body: "Isolation lives inside PostgreSQL itself, as row-level policies. A query that forgets its filter returns nothing, not everything.",
          },
          {
            title: "Deactivating an account ends its sessions at once",
            body: "A database trigger deletes the sessions the moment the account's status changes. Changing a password ends old sessions on every device.",
          },
          {
            title: "Analytics see IDs only",
            body: "No name, email or phone number reaches an analytics vendor, and minors are never identified at all. Session replay is off.",
          },
        ],
      },
    ],
    links: {
      title: "Read the policies themselves.",
      privacy: "Privacy policy",
      terms: "Terms of service",
    },
  },

  legal: {
    privacyTitle: "Privacy Policy",
    termsTitle: "Terms of Service",
    updated: "Last updated",
    contents: "Contents",
    privacyUpdated: "August 2, 2026",
    termsUpdated: "August 1, 2026",
  },

  contact: {
    meta: {
      title: "Contact — Linktich",
      description:
        "Ask about pricing, support or anything else. For anything urgent about a student, their center is faster.",
    },
    headline: "Tell us what you need, and we'll get back to you.",
    lede: "Pick the route closest to your question, or send us a message with the form.",

    routes: {
      title: "Ways to reach us",
      items: [
        {
          title: "Have an account?",
          body: "Sign in and use the messages inside your account. It's faster, and you don't retype your details on a public page.",
          cta: "Go to your account",
        },
        {
          title: "A question about a student?",
          body: "Talk to their center directly. Attendance, payments and the card are with them.",
          cta: null,
        },
        {
          title: "Anything else",
          body: "Use the form, and we'll reply to the email you give.",
          cta: null,
        },
      ],
    },

    safety: {
      title: "Don't send a student's details here.",
      body: "This page is public. Don't write a student's full name, national ID, address or any payment details.",
    },

    note: "We reply to the email you give. There is no committed response time yet.",

    form: {
      title: "Send us a message",
      name: "Name",
      email: "Email",
      phone: "Mobile number (optional)",
      subject: "Subject",
      message: "Your message",
      submit: "Send",
      sending: "Sending…",
      subjects: {
        pricing: "A pricing question",
        support: "Support",
        other: "Something else",
      },
      badName: "Write your name.",
      badEmail: "Check the email address.",
      minMessage: "Write at least 10 characters.",
      ok: {
        title: "Received.",
        body: "We'll reply to the email you gave. If it's urgent and about a student, their center is faster.",
      },
      failed: "We couldn't send it just now. Try again in a moment.",
      limited: "That's a lot of messages in a short time. Wait a minute and try again.",
    },
  },

  notFound: {
    meta: "Page not found — Linktich",
    title: "This page isn't here.",
    body: "The link may have a typo, or the page has moved.",
    home: "Back to home",
  },
};

const PAGES: Record<Locale, Pages> = { ar, en };

export function getPages(locale: Locale): Pages {
  return PAGES[locale];
}

export type { Pages };
