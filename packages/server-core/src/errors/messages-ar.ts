// Arabic translations for business-rule error messages. The canonical
// `error.message` stays English — screens substring-match it and tests assert
// it — so the envelope carries `messageAr` ALONGSIDE it and the client picks
// by locale. Coverage is enforced by
// apps/erp/tests/unit/business-rule-ar-coverage.test.ts: a new
// BusinessRuleError literal without an entry here is a red test.

export const AR_MESSAGES: Record<string, string> = {
  "A PDF file or material link is required": "مطلوب ملف PDF أو رابط للمادة",
  "A cancelled session cannot be completed": "لا يمكن إكمال حصة ملغاة",
  "A center is required": "يجب تحديد السنتر",
  "A completed session cannot be cancelled; its revenue is already distributed":
    "لا يمكن إلغاء حصة مكتملة؛ فقد وُزِّعت إيراداتها بالفعل",
  "A deletion request is already under review": "يوجد طلب حذف قيد المراجعة بالفعل",
  "A proposal for this teacher is already awaiting approval":
    "يوجد مقترح لهذا المدرّس بانتظار الموافقة بالفعل",
  "A reason is required": "يجب ذكر السبب",
  "A reason is required to force a logout": "يجب ذكر سبب لتسجيل الخروج الإجباري",
  "A reason is required to move a student": "يجب ذكر سبب لنقل الطالب",
  "A reason is required to reject a deletion request": "يجب ذكر سبب لرفض طلب الحذف",
  "A reason is required — what evidence was seen?": "يجب ذكر السبب — ما الدليل الذي ظهر؟",
  "A refund reason is required": "يجب ذكر سبب الاسترداد",
  "A review note is required to approve a deletion": "يجب كتابة ملاحظة مراجعة لاعتماد الحذف",
  "Active user with this email exists; use lookup instead":
    "يوجد حساب نشط بهذا البريد بالفعل؛ استخدم البحث بدلًا من الإنشاء",
  "Adjustment would make the balance negative": "هذه التسوية ستجعل الرصيد بالسالب",
  "Admin invite has no associated center": "دعوة المشرف غير مرتبطة بأي سنتر",
  "Already anonymized": "تمت إزالة الهوية بالفعل",
  "Already reopened — record the attendance and close the lesson":
    "أُعيد فتحها بالفعل — سجِّل الحضور ثم أغلق الحصة",
  "Amount must be a positive integer (minor units)": "يجب أن يكون المبلغ رقمًا صحيحًا موجبًا (بالقروش)",
  "Amount must be a positive whole number of piasters": "يجب أن يكون المبلغ عددًا صحيحًا موجبًا من القروش",
  "Amount must be an integer (minor units)": "يجب أن يكون المبلغ رقمًا صحيحًا (بالقروش)",
  "Amount must not be zero": "لا يمكن أن يكون المبلغ صفرًا",
  "An email address is required": "البريد الإلكتروني مطلوب",
  "An export is already being prepared for this account": "يوجد تصدير قيد التجهيز لهذا الحساب بالفعل",
  "Assessment name is required": "اسم التقييم مطلوب",
  "Cannot activate a deleted or suspended account": "لا يمكن تفعيل حساب محذوف أو موقوف",
  "Cannot delete room referenced by future sessions": "لا يمكن حذف قاعة مرتبطة بحصص قادمة",
  "Cannot leave center while you have active courses": "لا يمكن مغادرة السنتر وأنت لديك مجموعات نشطة",
  "Cannot remove teacher with active courses": "لا يمكن إزالة مدرّس لديه مجموعات نشطة",
  "Cannot remove the last admin of a center": "لا يمكن إزالة آخر مشرف في السنتر",
  "Center not found for credit move": "السنتر غير موجود لتنفيذ حركة الرصيد",
  "Center share cannot be negative": "نصيب السنتر لا يمكن أن يكون بالسالب",
  "Commission must be between 0 and 10000 basis points (0–100%)":
    "يجب أن تكون العمولة بين 0 و10000 نقطة أساس (0–100%)",
  "Counted cash must be a non-negative whole number of piasters":
    "النقدية المعدودة يجب أن تكون عددًا صحيحًا غير سالب من القروش",
  "Course already cancelled": "المجموعة ملغاة بالفعل",
  "Course has no payable price": "لا يوجد سعر مستحق لهذه المجموعة",
  "Course intent has no student to settle for": "طلب الدفع غير مرتبط بطالب لتسويته",
  "Course is full": "المجموعة مكتملة العدد",
  "Credit move must be a non-zero whole number of piasters":
    "حركة الرصيد يجب أن تكون عددًا صحيحًا من القروش غير صفري",
  "Date of birth cannot be in the future": "تاريخ الميلاد لا يمكن أن يكون في المستقبل",
  "Expense amount must be a positive integer": "قيمة المصروف يجب أن تكون رقمًا صحيحًا موجبًا",
  "Failed to allocate unique center shortId": "تعذر توليد مُعرّف قصير فريد للسنتر",
  "Fees must be non-negative whole piasters": "الرسوم يجب أن تكون قروشًا صحيحة غير سالبة",
  "File size must be 10 MB or less": "حجم الملف يجب ألا يتجاوز 10 ميجابايت",
  "Grades are not yet available for teacher-direct courses":
    "الدرجات غير متاحة بعد لمجموعات المدرّس المباشرة",
  "Group is full": "المجموعة مكتملة العدد",
  "Hall not found": "القاعة غير موجودة",
  "Intent has no center to settle against": "طلب الدفع غير مرتبط بسنتر لتسويته",
  "Intent has no gateway order yet": "لم يُنشأ أمر دفع لدى بوابة الدفع بعد",
  "Invalid Egyptian mobile number": "رقم موبايل مصري غير صحيح",
  "Invalid date of birth": "تاريخ ميلاد غير صحيح",
  "Invalid date range": "نطاق تاريخ غير صحيح",
  "Invalid staff role": "دور موظف غير صحيح",
  "Invoice has no recipient to email": "لا يوجد مستلم لإرسال الفاتورة إليه",
  "Lift the blacklist first": "ارفع الحظر أولًا",
  "Link already revoked": "الرابط مُلغى بالفعل",
  "Link is not pending": "الرابط ليس قيد الانتظار",
  "Material link must be a valid URL": "رابط المادة يجب أن يكون رابطًا صحيحًا",
  "Material link must use http or https": "رابط المادة يجب أن يبدأ بـ http أو https",
  "Materials are not yet available for teacher-direct courses":
    "المواد غير متاحة بعد لمجموعات المدرّس المباشرة",
  "Max score must be positive": "الدرجة العظمى يجب أن تكون موجبة",
  "Maximum top-up cannot be lower than the minimum": "الحد الأقصى للشحن لا يمكن أن يقل عن الحد الأدنى",
  "Maximum top-up must be a positive whole number of piasters":
    "الحد الأقصى للشحن يجب أن يكون عددًا صحيحًا موجبًا من القروش",
  "Minimum top-up must be a positive whole number of piasters":
    "الحد الأدنى للشحن يجب أن يكون عددًا صحيحًا موجبًا من القروش",
  "Monthly plan is not enabled for this course": "الاشتراك الشهري غير مفعّل لهذه المجموعة",
  "Name is required": "الاسم مطلوب",
  "National ID must be 14 digits": "الرقم القومي يجب أن يكون 14 رقمًا",
  "No active affiliation with this teacher": "لا يوجد ارتباط نشط بهذا المدرّس",
  "No available balance to pay out": "لا يوجد رصيد متاح للسحب",
  "No offline records provided": "لا توجد سجلات غير متصلة لمزامنتها",
  "Not a center credit top-up intent": "هذا الطلب ليس شحن رصيد سنتر",
  "Nothing to update": "لا يوجد ما يُحدَّث",
  "Online payments are not available yet": "الدفع الإلكتروني غير متاح حاليًا",
  "Only PDF files are accepted": "تُقبل ملفات PDF فقط",
  "Only a pending proposal can be approved": "لا يمكن اعتماد إلا مقترح قيد الانتظار",
  "Only a pending proposal can be rejected": "لا يمكن رفض إلا مقترح قيد الانتظار",
  "Only a queued export can be withdrawn": "لا يمكن سحب إلا تصدير في قائمة الانتظار",
  "Only an active account can be impersonated": "لا يمكن انتحال إلا حساب نشط",
  "Only an active account can be sent a reset link":
    "لا يمكن إرسال رابط إعادة التعيين إلا لحساب نشط",
  "Only an active account can be viewed as": "لا يمكن العرض بهوية إلا حساب نشط",
  "Only an active agreement can be ended": "لا يمكن إنهاء إلا اتفاق نشط",
  "Only an approved request can be anonymized": "لا يمكن إزالة الهوية إلا لطلب معتمد",
  "Only pending requests can be cancelled": "لا يمكن إلغاء إلا الطلبات قيد الانتظار",
  "Only unpaid subscriptions can be cancelled here": "لا يمكن الإلغاء هنا إلا للاشتراكات غير المدفوعة",
  "Opening float must be a non-negative whole number of piasters":
    "نقدية بداية الوردية يجب أن تكون عددًا صحيحًا غير سالب من القروش",
  "PROFILE_INCOMPLETE": "أكمل بيانات الملف الشخصي أولًا",
  "Payout has no receipt until paid": "لا يوجد إيصال للسحب قبل صرفه",
  "Per-session plan is not enabled for this course": "الدفع بالحصة غير مفعّل لهذه المجموعة",
  "Provide a guardian email or phone number": "أدخل بريد ولي الأمر أو رقم هاتفه",
  "Provide a phone, a national ID or a student code": "أدخل رقم هاتف أو رقمًا قوميًا أو كود طالب",
  "Rating must be 1–5": "التقييم يجب أن يكون من 1 إلى 5",
  "Reason is required": "يجب ذكر السبب",
  "Recipient has no email on file": "لا يوجد بريد إلكتروني مسجّل للمستلم",
  "Reviews can only be edited within 24 hours of submission":
    "لا يمكن تعديل التقييم إلا خلال 24 ساعة من إرساله",
  "Session is cancelled": "الحصة ملغاة",
  "Some students are not actively enrolled in this course":
    "بعض الطلاب غير مقيدين حاليًا في هذه المجموعة",
  "Some students are not enrolled in this group": "بعض الطلاب غير مقيدين في هذه المجموعة",
  "Student has no coverage for this session": "لا يوجد اشتراك يغطي هذه الحصة للطالب",
  "Student has no phone number": "لا يوجد رقم هاتف للطالب",
  "Student is already on the destination roster": "الطالب موجود بالفعل في كشف السنتر المستقبِل",
  "Student is blacklisted at this center": "الطالب محظور في هذا السنتر",
  "Student is not enrolled in this class": "الطالب غير مقيد في هذه المجموعة",
  "Student is not in this center roster": "الطالب ليس في كشف هذا السنتر",
  "Student is not on this center's roster": "الطالب ليس في كشف هذا السنتر",
  "Student name is required": "اسم الطالب مطلوب",
  "Students must specify email or phone to find parent":
    "يجب إدخال بريد أو هاتف للعثور على ولي الأمر",
  "Teacher does not have an active affiliation with this center":
    "لا يوجد ارتباط نشط بين المدرّس وهذا السنتر",
  "Teacher name cannot be empty": "اسم المدرّس لا يمكن أن يكون فارغًا",
  "Teacher name is required": "اسم المدرّس مطلوب",
  "Teacher-direct sessions have no lesson charge to refund":
    "حصص المدرّس المباشرة ليس لها رسوم حصة لاستردادها",
  "Temp student has no invite code": "لا يوجد كود دعوة للطالب المؤقت",
  "That user is not a student": "هذا المستخدم ليس طالبًا",
  "The destination center is not active": "السنتر المستقبِل غير نشط",
  "The end of the period must be after its start": "نهاية الفترة يجب أن تأتي بعد بدايتها",
  "The file has a header but no student rows": "الملف يحتوي على عناوين فقط بلا صفوف طلاب",
  "The flat per-student fee must be a whole number of piasters >= 0":
    "الرسم الثابت لكل طالب يجب أن يكون عددًا صحيحًا من القروش ≥ 0",
  "The register is still open for this lesson — no reopen needed":
    "كشف هذه الحصة ما زال مفتوحًا — لا حاجة لإعادة الفتح",
  "The request changed state while cancelling — reload and retry":
    "تغيّرت حالة الطلب أثناء الإلغاء — حدِّث الصفحة وحاول مرة أخرى",
  "The source and destination centers are the same": "سنتر المصدر وسنتر الوجهة متطابقان",
  "The three shares must sum to exactly 100% (10000 basis points)":
    "مجموع الأنصبة الثلاثة يجب أن يساوي 100% بالضبط (10000 نقطة أساس)",
  "This account already has credentials": "هذا الحساب لديه بيانات دخول بالفعل",
  "This account cannot claim credentials here": "لا يمكن لهذا الحساب استلام بيانات الدخول من هنا",
  "This account does not have 2FA enabled": "التحقق بخطوتين غير مفعّل لهذا الحساب",
  "This account has no email address to send a reset to":
    "لا يوجد بريد إلكتروني لهذا الحساب لإرسال رابط إعادة التعيين",
  "This account is blacklisted — lift the blacklist first": "هذا الحساب محظور — ارفع الحظر أولًا",
  "This assistant account is not active": "حساب المساعد هذا غير نشط",
  "This card is already revoked": "هذه البطاقة مُلغاة بالفعل",
  "This course is joined by subscription, not enrollment request":
    "الانضمام لهذه المجموعة يكون بالاشتراك، لا بطلب قيد",
  "This export has expired. Request a new one.": "انتهت صلاحية هذا التصدير. اطلب تصديرًا جديدًا.",
  "This export is not ready": "هذا التصدير غير جاهز بعد",
  "This hall does not offer the requested pricing method":
    "هذه القاعة لا تدعم طريقة التسعير المطلوبة",
  "This invite code is not claimable": "كود الدعوة هذا غير قابل للاستخدام",
  "This lesson has already been closed — settled attendance never reopens":
    "أُغلقت هذه الحصة بالفعل — الحضور المُسوَّى لا يُعاد فتحه",
  "This link is not valid or has expired": "هذا الرابط غير صالح أو انتهت صلاحيته",
  "This phone belongs to a non-student account": "هذا الرقم يخص حسابًا ليس طالبًا",
  "This request has expired": "انتهت صلاحية هذا الطلب",
  "This session can no longer be booked": "لم يعد حجز هذه الحصة متاحًا",
  "This session has already been settled": "سُوِّيت هذه الحصة بالفعل",
  "This shift is already closed": "هذه الوردية مُغلقة بالفعل",
  "This staff account is not active": "حساب الموظف هذا غير نشط",
  "This staff role cannot export this report": "هذا الدور الوظيفي لا يمكنه تصدير هذا التقرير",
  "This student has no guardian email to verify": "لا يوجد بريد ولي أمر لهذا الطالب للتحقق منه",
  "This student is not an invited temp student": "هذا الطالب ليس طالبًا مؤقتًا مدعوًّا",
  "This subject is not offered for the chosen grade/track":
    "هذه المادة غير متاحة للصف/الشعبة المختارة",
  "This teacher has already set a password": "هذا المدرّس عيّن كلمة مرور بالفعل",
  "This teacher has no email address": "لا يوجد بريد إلكتروني لهذا المدرّس",
  "This teacher has not been converted to the platform yet":
    "لم يُحوَّل هذا المدرّس إلى المنصة بعد",
  "This teacher is already off-system": "هذا المدرّس خارج المنصة بالفعل",
  "This teacher is not removed": "هذا المدرّس غير محذوف",
  "Top-up amount must be a positive amount": "قيمة الشحن يجب أن تكون مبلغًا موجبًا",
  "Unknown report": "تقرير غير معروف",
  "Use invite for shell accounts": "استخدم الدعوة للحسابات غير المفعّلة",
  "Wallet credit amount must be a positive integer": "قيمة إيداع المحفظة يجب أن تكون رقمًا صحيحًا موجبًا",
  "Wallet debit amount must be a positive integer": "قيمة خصم المحفظة يجب أن تكون رقمًا صحيحًا موجبًا",
  "You already have an open shift — close it before opening another":
    "لديك وردية مفتوحة بالفعل — أغلقها قبل فتح وردية أخرى",
  "centerId is required": "يجب تحديد السنتر",
  "centerId query param is required": "يجب تحديد السنتر",
  "courseId is required for a course broadcast": "يجب تحديد المجموعة لإرسال إعلان للمجموعة",
  "courseId, title and type are required": "المجموعة والعنوان والنوع مطلوبة",
  "delta must be a non-zero integer": "قيمة التعديل يجب أن تكون رقمًا صحيحًا غير صفري",
  "file is required": "الملف مطلوب",
  "fixed_per_student needs a positive rateFlat, and no rateBp":
    "التسعير الثابت لكل طالب يحتاج قيمة ثابتة موجبة، بدون نسبة",
  "issuedToId (teacher) is required": "يجب تحديد المدرّس",
  "linkId query param is required": "يجب تحديد الرابط",
  "mock-complete is only available when PAYMENTS_MODE=mock":
    "إتمام الدفع التجريبي متاح فقط في وضع الدفع التجريبي",
  "paymentId is required for a payment receipt": "يجب تحديد الدفعة لإصدار الإيصال",
  "percent_of_net needs rateBp between 0 and 10000, and no rateFlat":
    "نسبة الصافي تحتاج نسبة بين 0 و10000 نقطة أساس، بدون قيمة ثابتة",
  "sessionId is required": "يجب تحديد الحصة",
  "sessionId is required for a per-session pass": "يجب تحديد الحصة لتذكرة الحصة الواحدة",
  "startDate cannot be moved into the past": "لا يمكن نقل تاريخ البداية إلى الماضي",
  "studentId is required": "يجب تحديد الطالب",
  "studentId is required — choose which child": "يجب تحديد الطالب — اختر أي طفل",
  "studentId or studentCode is required": "يجب تحديد الطالب أو إدخال كود الطالب",
  "teacherId is required": "يجب تحديد المدرّس",
  "A completed session cannot be postponed; its revenue is already distributed":
    "لا يمكن تأجيل حصة مكتملة؛ فقد وُزِّعت إيراداتها بالفعل",
  "A course cannot be moved between centers: its pricing snapshot is frozen from its own center's configuration and its completed sessions have already settled to that center. Cancel it and create the class at the new center instead.":
    "لا يمكن نقل مجموعة بين السناتر: تسعيرها مُجمَّد على إعدادات سنترها، وحصصها المكتملة سُوِّيت لذلك السنتر بالفعل. ألغِها وأنشئ المجموعة في السنتر الجديد.",
  "A feature-flag key must be lowercase, dotted, and free of spaces (e.g. receipts.pdf)":
    "مفتاح الخاصية يجب أن يكون بحروف صغيرة ونقاط وبدون مسافات (مثال: receipts.pdf)",
  "A hall cannot be attached to an existing class — create a new class for the hall":
    "لا يمكن ربط قاعة بمجموعة قائمة — أنشئ مجموعة جديدة للقاعة",
  "A minor's account can only be deleted at the request of their approved guardian":
    "حساب القاصر لا يُحذف إلا بطلب من ولي أمره المعتمد",
  "A student with this phone or national ID already exists — re-run the import to link them":
    "يوجد طالب بهذا الهاتف أو الرقم القومي بالفعل — أعد تشغيل الاستيراد لربطه",
  "Amount must be positive — use the refund flow to return money, not a negative payment":
    "المبلغ يجب أن يكون موجبًا — لإرجاع المال استخدم الاسترداد، لا دفعة سالبة",
  "An email address is required before this teacher can join the platform":
    "البريد الإلكتروني مطلوب قبل انضمام هذا المدرّس إلى المنصة",
  "At least one plan price (monthly or per-session) must be set":
    "يجب تحديد سعر خطة واحدة على الأقل (شهري أو بالحصة)",
  "Choose a pricing method for this hall to accept the request":
    "اختر طريقة تسعير لهذه القاعة لقبول الطلب",
  "Course price is too low for this hall's per-student fee — sessions could not be settled":
    "سعر المجموعة أقل من رسم القاعة لكل طالب — لن يمكن تسوية الحصص",
  "Each share must be a whole number of basis points between 0 and 10000":
    "كل نصيب يجب أن يكون عددًا صحيحًا من نقاط الأساس بين 0 و10000",
  "File uploads need Cloudinary storage configured. Add Cloudinary env vars or use a PDF link for now.":
    "رفع الملفات يحتاج إعداد تخزين Cloudinary. أضِف متغيرات Cloudinary أو استخدم رابط PDF مؤقتًا.",
  "Image uploads are not configured on this server. Add a photo URL instead, or set CLOUDINARY_* env vars.":
    "رفع الصور غير مُعد على هذا الخادم. استخدم رابط صورة بدلًا من ذلك، أو اضبط متغيرات CLOUDINARY_*.",
  "Image uploads are not configured on this server. Set the CLOUDINARY_* env vars.":
    "رفع الصور غير مُعد على هذا الخادم. اضبط متغيرات CLOUDINARY_*.",
  "Insufficient wallet balance to settle this payout": "رصيد المحفظة لا يكفي لتسوية هذا السحب",
  "Only an ERP account can be viewed as — a back-office account is impersonated in this app instead":
    "العرض بالهوية متاح لحسابات النظام فقط — حسابات الإدارة تُنتحل داخل هذا التطبيق",
  "Per-student pricing is not configured for this hall yet — the platform must set the rate first":
    "تسعير القاعة لكل طالب غير مُعد بعد — يجب أن تحدد المنصة المعدل أولًا",
  "Per-student rate plus the platform share exceeds 100% of the lesson price":
    "رسم القاعة لكل طالب مضافًا إليه نصيب المنصة يتجاوز 100% من سعر الحصة",
  "Set exactly one rate form: a flat EGP amount per student OR a percentage per student":
    "حدد صيغة واحدة فقط للمعدل: مبلغ ثابت بالجنيه لكل طالب أو نسبة لكل طالب",
  "Student has not been checked in at the counter — door check-in requires the counter first":
    "لم يُسجَّل الطالب على الكاونتر — تسجيل الباب يتطلب الكاونتر أولًا",
  "The center share must be a whole number of piasters between 0 and 999,999":
    "نصيب السنتر يجب أن يكون عددًا صحيحًا من القروش بين 0 و999,999",
  "The guardian email must be different from the student's own login email":
    "بريد ولي الأمر يجب أن يختلف عن بريد دخول الطالب",
  "The hall's per-student fee exceeds this lesson's price — set the course pricing before completing sessions":
    "رسم القاعة لكل طالب يتجاوز سعر هذه الحصة — اضبط تسعير المجموعة قبل إكمال الحصص",
  "The per-student percentage must be between 0 and 10000 basis points":
    "نسبة كل طالب يجب أن تكون بين 0 و10000 نقطة أساس",
  "The platform publishes this rate as a flat amount — your hall's rate must be a flat amount too":
    "المنصة تعتمد هذا المعدل كمبلغ ثابت — معدل قاعتك يجب أن يكون مبلغًا ثابتًا أيضًا",
  "The platform publishes this rate as a percentage — your hall's rate must be a percentage too":
    "المنصة تعتمد هذا المعدل كنسبة — معدل قاعتك يجب أن يكون نسبة أيضًا",
  "The teacher chooses the pricing method for this hall when accepting":
    "المدرّس هو من يختار طريقة تسعير هذه القاعة عند القبول",
  "This assistant has already set a password — ask them to use 'forgot password'":
    "هذا المساعد عيّن كلمة مرور بالفعل — اطلب منه استخدام «نسيت كلمة المرور»",
  "This course's hall is part of its pricing arrangement and cannot be changed — create a new class for a different hall":
    "قاعة هذه المجموعة جزء من ترتيب تسعيرها ولا يمكن تغييرها — أنشئ مجموعة جديدة لقاعة أخرى",
  "This lesson has ended — the counter register is closed":
    "انتهت هذه الحصة — كشف الكاونتر مُغلق",
  "This lesson has ended — the door register is closed": "انتهت هذه الحصة — كشف الباب مُغلق",
  "This lesson has no price — set the class pricing before completing sessions":
    "لا يوجد سعر لهذه الحصة — اضبط تسعير المجموعة قبل إكمال الحصص",
  "This session has already been settled — it cannot be moved":
    "سُوِّيت هذه الحصة بالفعل — لا يمكن نقلها",
  "This session has already been settled — its revenue is distributed and it cannot be cancelled":
    "سُوِّيت هذه الحصة بالفعل — وُزِّعت إيراداتها ولا يمكن إلغاؤها",
  "This staff account is already active at another center":
    "حساب الموظف هذا نشط بالفعل في سنتر آخر",
  "This staff member has already set a password — ask them to use 'forgot password'":
    "هذا الموظف عيّن كلمة مرور بالفعل — اطلب منه استخدام «نسيت كلمة المرور»",
  "This teacher also works with another center on the platform and cannot be taken off-system here":
    "هذا المدرّس يعمل أيضًا مع سنتر آخر على المنصة ولا يمكن إخراجه من النظام من هنا",
  "This teacher is on the platform — they manage their own records":
    "هذا المدرّس على المنصة — وهو من يدير سجلاته بنفسه",
  "This teacher still has active groups — end or reassign them first":
    "لا تزال لهذا المدرّس مجموعات نشطة — أنهِها أو أعد إسنادها أولًا",
  "Your login email must be different from your guardian's email":
    "بريد دخولك يجب أن يختلف عن بريد ولي أمرك",
  "effectiveFrom must be after the current agreement's own start":
    "تاريخ السريان يجب أن يأتي بعد بداية الاتفاق الحالي",
};

type ArPattern = { re: RegExp; ar: (m: RegExpExecArray) => string; sample: string };

// Rendered template messages — matched by shape, interpolations carried over.
// Status words inside captures stay as sent; the surrounding sentence is what
// counter staff need to understand.
export const AR_PATTERNS: ArPattern[] = [
  {
    re: /^A reason is required to (.+)$/,
    ar: (m) => `يجب ذكر سبب لتنفيذ: ${m[1]}`,
    sample: "A reason is required to suspend",
  },
  {
    re: /^A room can have at most (\d+) photos$/,
    ar: (m) => `القاعة يمكن أن تحتوي على ${m[1]} صور كحد أقصى`,
    sample: "A room can have at most 6 photos",
  },
  {
    re: /^Account is already (.+)$/,
    ar: (m) => `الحساب بالفعل في حالة "${m[1]}"`,
    sample: "Account is already active",
  },
  {
    re: /^Affiliation is already (.+)$/,
    ar: (m) => `الارتباط بالفعل في حالة "${m[1]}"`,
    sample: "Affiliation is already ended",
  },
  {
    re: /^Cannot toggle a center in status '(.+)'$/,
    ar: (m) => `لا يمكن تغيير حالة سنتر في وضع "${m[1]}"`,
    sample: "Cannot toggle a center in status 'deleted'",
  },
  {
    re: /^Cannot transition from (.+) to refunded$/,
    ar: (m) => `لا يمكن الانتقال من حالة "${m[1]}" إلى الاسترداد`,
    sample: "Cannot transition from pending to refunded",
  },
  {
    re: /^Cannot transition from (.+) to (.+)$/,
    ar: (m) => `لا يمكن الانتقال من حالة "${m[1]}" إلى "${m[2]}"`,
    sample: "Cannot transition from paid to pending",
  },
  {
    re: /^Center is already (.+)$/,
    ar: (m) => `السنتر بالفعل في حالة "${m[1]}"`,
    sample: "Center is already suspended",
  },
  {
    re: /^Invalid category\. Must be one of: (.+)$/,
    ar: (m) => `فئة غير صحيحة. الفئات المتاحة: ${m[1]}`,
    sample: "Invalid category. Must be one of: rent, salaries",
  },
  {
    re: /^Invalid letter grade: (.+)$/,
    ar: (m) => `تقدير غير صحيح: ${m[1]}`,
    sample: "Invalid letter grade: Q",
  },
  {
    re: /^Mock signature failed: (.+)$/,
    ar: (m) => `فشل توقيع الدفع التجريبي: ${m[1]}`,
    sample: "Mock signature failed: bad hmac",
  },
  {
    re: /^Payout is already (.+)$/,
    ar: (m) => `السحب بالفعل في حالة "${m[1]}"`,
    sample: "Payout is already paid",
  },
  {
    re: /^Request (?:is )?already (.+)$/,
    ar: (m) => `الطلب بالفعل في حالة "${m[1]}"`,
    sample: "Request already approved",
  },
  {
    re: /^Teacher is already (.+)$/,
    ar: (m) => `المدرّس بالفعل في حالة "${m[1]}"`,
    sample: "Teacher is already active",
  },
  {
    re: /^This request is already (.+)$/,
    ar: (m) => `هذا الطلب بالفعل في حالة "${m[1]}"`,
    sample: "This request is already cancelled",
  },
  {
    re: /^Unknown cron job: (.+)$/,
    ar: (m) => `مهمة مجدولة غير معروفة: ${m[1]}`,
    sample: "Unknown cron job: digest",
  },
  {
    re: /^Unsupported invoice type: (.+)$/,
    ar: (m) => `نوع فاتورة غير مدعوم: ${m[1]}`,
    sample: "Unsupported invoice type: misc",
  },
  {
    re: /^User is a '(.+)', not a (.+)$/,
    ar: (m) => `هذا المستخدم "${m[1]}" وليس "${m[2]}"`,
    sample: "User is a 'parent', not a student",
  },
  {
    re: /^You cannot (.+) your own account$/,
    ar: (m) => `لا يمكنك تنفيذ "${m[1]}" على حسابك الشخصي`,
    sample: "You cannot suspend your own account",
  },
  {
    re: /^Amount exceeds available balance \((.+) EGP available\)$/,
    ar: (m) => `المبلغ يتجاوز الرصيد المتاح (المتاح ${m[1]} جنيه)`,
    sample: "Amount exceeds available balance (50.00 EGP available)",
  },
  {
    re: /^Cannot (.+) a center in status '(.+)' — use the registration or blacklist flow$/,
    ar: (m) =>
      `لا يمكن تنفيذ "${m[1]}" على سنتر في حالة "${m[2]}" — استخدم مسار التسجيل أو الحظر`,
    sample: "Cannot suspend a center in status 'pending' — use the registration or blacklist flow",
  },
  {
    re: /^Maximum top-up cannot exceed (.+) EGP$/,
    ar: (m) => `الحد الأقصى للشحن لا يمكن أن يتجاوز ${m[1]} جنيه`,
    sample: "Maximum top-up cannot exceed 100,000 EGP",
  },
  {
    re: /^Maximum top-up is (.+) EGP$/,
    ar: (m) => `الحد الأقصى للشحن هو ${m[1]} جنيه`,
    sample: "Maximum top-up is 5000.00 EGP",
  },
  {
    re: /^Minimum top-up is (.+) EGP$/,
    ar: (m) => `الحد الأدنى للشحن هو ${m[1]} جنيه`,
    sample: "Minimum top-up is 10.00 EGP",
  },
  {
    re: /^Score (.+) for student (.+) is out of range \[0, (.+)\]$/,
    ar: (m) => `الدرجة ${m[1]} للطالب ${m[2]} خارج النطاق [0، ${m[3]}]`,
    sample: "Score 12 for student abc is out of range [0, 10]",
  },
  {
    re: /^Score (.+) is not a valid letter grade value \(0-4 mapping to F-A\)$/,
    ar: (m) => `الدرجة ${m[1]} ليست قيمة تقدير صحيحة (من 0 إلى 4 مقابل F إلى A)`,
    sample: "Score 7 is not a valid letter grade value (0-4 mapping to F-A)",
  },
  {
    re: /^Score must be between 0 and (.+)$/,
    ar: (m) => `الدرجة يجب أن تكون بين 0 و${m[1]}`,
    sample: "Score must be between 0 and 20",
  },
  {
    re: /^Student (.+) is not enrolled in this course$/,
    ar: (m) => `الطالب ${m[1]} غير مقيد في هذه المجموعة`,
    sample: "Student abc is not enrolled in this course",
  },
  {
    re: /^This file has (\d+) rows; the limit is (\d+) per import\. Split it and import each part\.$/,
    ar: (m) =>
      `الملف يحتوي على ${m[1]} صفًا والحد الأقصى ${m[2]} لكل استيراد. قسِّمه واستورد كل جزء على حدة.`,
    sample: "This file has 900 rows; the limit is 500 per import. Split it and import each part.",
  },
  {
    re: /^This teacher is owed (.+) EGP — you cannot settle more than that$/,
    ar: (m) => `المستحق لهذا المدرّس ${m[1]} جنيه — لا يمكنك تسوية أكثر من ذلك`,
    sample: "This teacher is owed 250.00 EGP — you cannot settle more than that",
  },
  {
    re: /^Top-up must be between (.+) and (.+) EGP$/,
    ar: (m) => `الشحن يجب أن يكون بين ${m[1]} و${m[2]} جنيه`,
    sample: "Top-up must be between 10 and 5000 EGP",
  },
  {
    re: /^Your hall's per-student share may not exceed the platform maximum of (.+)%$/,
    ar: (m) => `نصيب قاعتك لكل طالب لا يجوز أن يتجاوز الحد الأقصى للمنصة وهو ${m[1]}%`,
    sample: "Your hall's per-student share may not exceed the platform maximum of 15%",
  },
  {
    re: /^Your hall's per-student share may not exceed the platform maximum of (.+) EGP$/,
    ar: (m) => `نصيب قاعتك لكل طالب لا يجوز أن يتجاوز الحد الأقصى للمنصة وهو ${m[1]} جنيه`,
    sample: "Your hall's per-student share may not exceed the platform maximum of 15 EGP",
  },
];

// Rendered-template sources this module knows how to match. The coverage test
// harvests `new BusinessRuleError(\`...\`)` literals and asserts each appears
// here, so a NEW templated message without a pattern is a red test.
export const AR_TEMPLATE_SOURCES: string[] = [
  "A reason is required to ${what}",
  "A room can have at most ${MAX_PHOTOS_PER_ROOM} photos",
  "Account is already ${next}",
  "Affiliation is already ${affiliation.status}",
  "Cannot toggle a center in status '${center.status}'",
  "Cannot transition from ${currentStatus} to ${newStatus}",
  "Cannot transition from ${current} to refunded",
  "Center is already ${center.status}",
  'Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(", ")}',
  "Invalid letter grade: ${letter}",
  "Mock signature failed: ${verification.error}",
  "Payout is already ${exists.status}",
  "Request already ${existing.status}",
  "Request already ${req.status}",
  "Request is already ${request.status}",
  "Teacher is already ${u.status}",
  "This request is already ${row.status}",
  "Unknown cron job: ${job}",
  "Unsupported invoice type: ${input.type}",
  "User is a '${user.role}', not a ${kind}",
  "You cannot ${what} your own account",
  "Amount exceeds available balance (${(available / 100).toFixed(2)} EGP available)",
  "Cannot ${action} a center in status '${center.status}' — use the registration or blacklist flow",
  "Maximum top-up cannot exceed ${(ABSOLUTE_MAX / 100).toLocaleString()} EGP",
  "Maximum top-up is ${(settings.maxTopup / 100).toFixed(2)} EGP",
  "Minimum top-up is ${(settings.minTopup / 100).toFixed(2)} EGP",
  "Score ${entry.score} for student ${entry.studentId} is out of range [0, ${existing.maxScore}]",
  "Score ${entry.score} is not a valid letter grade value (0-4 mapping to F-A)",
  "Score must be between 0 and ${grade.maxScore}",
  "Student ${entry.studentId} is not enrolled in this course",
  "This file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it and import each part.",
  "This teacher is owed ${(profile.walletBalance / 100).toFixed(2)} EGP — you cannot settle more than that",
  "Top-up must be between ${MIN_TOPUP / 100} and ${MAX_TOPUP / 100} EGP",
  "Your hall's per-student share may not exceed the platform maximum of ${ceiling.bp / 100}%",
  "Your hall's per-student share may not exceed the platform maximum of ${ceiling.fee! / 100} EGP",
];

export function arabicErrorMessage(message: string): string | undefined {
  const direct = AR_MESSAGES[message];
  if (direct) return direct;
  for (const { re, ar } of AR_PATTERNS) {
    const m = re.exec(message);
    if (m) return ar(m);
  }
  return undefined;
}
