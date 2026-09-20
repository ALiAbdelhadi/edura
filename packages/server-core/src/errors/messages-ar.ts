// Arabic translations for server error messages. The canonical
// `error.message` stays English — screens substring-match it and tests assert
// it — so the envelope carries `messageAr` ALONGSIDE it and the client picks
// by locale. Coverage is enforced by
// apps/erp/tests/unit/business-rule-ar-coverage.test.ts: a new
// BusinessRuleError / NotFoundError / ForbiddenError / ConflictError literal
// (or a class default) without an entry here is a red test.

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
  "A lesson under this receipt has already been settled — refund the lesson instead":
    "تمت تسوية درس من هذا الإيصال ووُزّعت حصصه على المدرّس والسنتر — استخدم استرداد الدرس بدلًا من ذلك",
  "A refund cannot reverse another refund": "لا يمكن استرداد عملية استرداد",
  "A gateway refund is confirmed by the provider, not by hand":
    "الاسترداد الإلكتروني بيتأكّد من شركة الدفع نفسها، مش باليد",
  "A reference is required to confirm a refund": "يجب إدخال رقم مرجع لتأكيد الاسترداد",
  "A refund reason is required": "يجب ذكر سبب الاسترداد",
  "This is already your login email": "هذا هو بريد تسجيل الدخول الحالي بالفعل",
  "Invalid confirmation link": "رابط التأكيد غير صالح",
  "This confirmation link was already used": "رابط التأكيد هذا استُخدم بالفعل",
  "This confirmation link has expired": "انتهت صلاحية رابط التأكيد",
  "You generated this payout — a different person must approve it":
    "أنت من أنشأ هذا الصرف — يجب أن يعتمده شخص آخر",
  "The person who approved a payout cannot also mark it paid":
    "من اعتمد الصرف لا يمكنه تسجيل دفعه أيضًا — شخص ثانٍ مطلوب",
  "A payout must be approved before it can be marked paid":
    "يجب اعتماد الصرف أولًا قبل تسجيل دفعه",
  "A transfer reference is required to mark a payout paid":
    "يجب إدخال رقم مرجع التحويل لتسجيل الدفع",
  "This transfer reference was already used for another payout":
    "رقم مرجع التحويل هذا مستخدم بالفعل لصرف آخر",
  "This refund channel is not available yet": "طريقة الاسترداد هذه غير متاحة حاليًا",
  "A checkout for this course is already in progress — finish it or cancel it first":
    "يوجد عملية دفع جارية لهذه المجموعة بالفعل — أكملها أو ألغِها أولًا",
  "Idempotency key belongs to a different checkout": "مفتاح الطلب هذا يخص عملية دفع مختلفة",
  "A parent-wallet top-up cannot be refunded at the counter":
    "شحن محفظة ولي الأمر لا يُسترد من الكاونتر",
  "The wallet no longer holds this top-up — it has been spent, so it cannot be refunded":
    "المحفظة لم تعد تحتوي على مبلغ الشحن — تم إنفاقه، فلا يمكن استرداده",
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
  "periodEnd cannot be before periodStart": "تاريخ نهاية الفترة لا يمكن أن يسبق تاريخ بدايتها",
  "periodEnd is not a valid date": "تاريخ نهاية الفترة غير صحيح",
  "periodStart is not a valid date": "تاريخ بداية الفترة غير صحيح",
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
  "National ID must be 14 digits — Excel turned it into scientific notation; format the column as Text and export again":
    "الرقم القومي اتحوّل في Excel لصيغة علمية (مثل 3.08E+13) — اجعل تنسيق العمود «نص» (Text) وصدّر الملف من جديد",
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
  "Original payment not found": "الإيصال الأصلي غير موجود",
  "PROFILE_INCOMPLETE": "أكمل بيانات الملف الشخصي أولًا",
  "Payout has no receipt until paid": "لا يوجد إيصال للسحب قبل صرفه",
  "Per-session plan is not enabled for this course": "الدفع بالحصة غير مفعّل لهذه المجموعة",
  "Provide a guardian email or phone number": "أدخل بريد ولي الأمر أو رقم هاتفه",
  "Provide a phone, a national ID or a student code": "أدخل رقم هاتف أو رقمًا قوميًا أو كود طالب",
  "Rating must be 1–5": "التقييم يجب أن يكون من 1 إلى 5",
  "Reason is required": "يجب ذكر السبب",
  "Recipient has no email on file": "لا يوجد بريد إلكتروني مسجّل للمستلم",
  "Refund exceeds the original payment": "مبلغ الاسترداد أكبر من قيمة الإيصال الأصلي",
  "Refund not found": "عملية الاسترداد غير موجودة",
  "This refund request was already recorded": "تم تسجيل طلب الاسترداد هذا بالفعل — لن يُنفَّذ مرة ثانية",
  "This receipt is not a refund": "هذا الإيصال ليس عملية استرداد",
  "This refund is already confirmed": "تم تأكيد هذا الاسترداد بالفعل",
  "This receipt names no student": "هذا الإيصال غير مرتبط بأي طالب",
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
  "An onsite class has no meeting link — pick online or hybrid to add one":
    "الحصة الحضورية ملهاش لينك — اختر أونلاين أو حضوري+أونلاين عشان تضيف لينك",
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
  // Not-found / forbidden / conflict messages (every class, all three roots) and the
  // AppError subclass DEFAULTS reached by a bare `new ForbiddenError()`. Added
  // 2026-09-05; the coverage test now harvests these classes too, so a new
  // NotFoundError / ForbiddenError / ConflictError literal without an entry is a red test.
  "A cancelled lesson's attendance cannot be corrected": "لا يمكن تعديل حضور حصة ملغاة",
  "A pending link already exists": "يوجد طلب ربط معلّق بالفعل",
  "A registered user already has this phone — use lookup to link instead":
    "يوجد حساب مسجّل بهذا الهاتف بالفعل — استخدم البحث للربط بدلًا من الإنشاء",
  "A student can only list their own subscriptions": "يمكن للطالب عرض اشتراكاته هو فقط",
  "A student can only read their own wallet": "يمكن للطالب الاطّلاع على محفظته هو فقط",
  "A student can only subscribe for themselves": "يمكن للطالب الاشتراك لنفسه فقط",
  "A student with this national ID already exists — search for them instead":
    "يوجد طالب بهذا الرقم القومي بالفعل — ابحث عنه بدلًا من إنشائه",
  "Account not found": "الحساب غير موجود",
  "Active affiliation not found": "لا يوجد ارتباط نشط",
  "Active blacklist entry not found": "لا يوجد حظر نشط بهذا المعرّف",
  "Active parent link not found": "لا يوجد ربط نشط بولي أمر",
  "Actor has no center scope": "الحساب المنفّذ غير مرتبط بأي سنتر",
  "Admin not found in this center": "المشرف غير موجود في هذا السنتر",
  "Affiliation not found": "الارتباط غير موجود",
  "Affiliation not found at this center": "الارتباط غير موجود في هذا السنتر",
  "Agreement not found": "الاتفاقية غير موجودة",
  "Agreement proposal not found": "مقترح الاتفاقية غير موجود",
  "Already enrolled in this course": "مسجَّل في هذه المجموعة بالفعل",
  "An account with this email or phone already exists": "يوجد حساب بهذا البريد أو الهاتف بالفعل",
  "An open collaboration request between this teacher, center, and subject already exists":
    "يوجد طلب تعاون مفتوح بالفعل بين هذا المدرّس والسنتر لهذه المادة",
  "Another agreement for this teacher was activated at the same time; reload and try again":
    "تم تفعيل اتفاقية أخرى لهذا المدرّس في الوقت نفسه؛ أعد تحميل الصفحة وحاول مجددًا",
  "Another center already keeps records for this teacher":
    "سنتر آخر يحتفظ بسجلات هذا المدرّس بالفعل",
  "Assessment not found": "التقييم غير موجود",
  "Assistant account not found": "حساب المساعد غير موجود",
  "Assistant is not linked to a teacher": "المساعد غير مرتبط بأي مدرّس",
  "Assistant not found on your team": "المساعد غير موجود في فريقك",
  "Attendance edit window has passed (locked=true)": "انتهت مهلة تعديل الحضور (مقفول)",
  "Attendance record belongs to a different center": "سجل الحضور يتبع سنترًا آخر",
  "Attendance record not found": "سجل الحضور غير موجود",
  "Beneficiary not found": "المستفيد غير موجود",
  "Blacklist entry not found at this center": "الحظر غير موجود في هذا السنتر",
  "Business rule violated": "هذا الإجراء يخالف قواعد النظام",
  "Catalog entries missing for this request": "بيانات المادة أو الصف الخاصة بهذا الطلب غير موجودة",
  "Center accountant is read-only": "محاسب السنتر له صلاحية القراءة فقط",
  "Center actor has no center": "الحساب المنفّذ غير مرتبط بأي سنتر",
  "Center admin has no center": "مشرف السنتر غير مرتبط بأي سنتر",
  "Center is already blacklisted": "السنتر محظور بالفعل",
  "Center not found": "السنتر غير موجود",
  "Center not found or not active": "السنتر غير موجود أو غير نشط",
  "Center onboarding requires a center admin": "إعداد السنتر يتطلب حساب مشرف سنتر",
  "Center owners only": "لمالكي السنتر فقط",
  "Centers can only invite to their own center": "يمكن للسنتر الدعوة إلى سنتره فقط",
  "Class not found": "المجموعة غير موجودة",
  "Collaboration request not found": "طلب التعاون غير موجود",
  "Conflict": "تعارض مع بيانات موجودة",
  "Contact submission not found": "رسالة التواصل غير موجودة",
  "Course belongs to a different center": "المجموعة تتبع سنترًا آخر",
  "Course not found": "المجموعة غير موجودة",
  "Course not found at this center": "المجموعة غير موجودة في هذا السنتر",
  "Course not found or not active": "المجموعة غير موجودة أو غير نشطة",
  "Course not in your center": "المجموعة ليست في سنترك",
  "Deletion request not found": "طلب الحذف غير موجود",
  "Destination center not found": "السنتر المستهدف غير موجود",
  "Device token not found": "رمز الجهاز غير موجود",
  "Education system not found": "النظام التعليمي غير موجود",
  "Email already in use": "البريد الإلكتروني مستخدم بالفعل",
  "Email exists with a different role": "البريد الإلكتروني مسجّل بدور مختلف",
  "Email or phone already in use": "البريد الإلكتروني أو الهاتف مستخدم بالفعل",
  "This email or phone is registered at a centre — use the link or code the centre sent you":
    "هذا البريد أو الهاتف مسجّل عند سنتر — استخدم الرابط أو الكود الذي أرسله لك السنتر",
  "Enrollment not found": "التسجيل غير موجود",
  "Enrollment request already pending": "يوجد طلب تسجيل معلّق بالفعل",
  "Expense not found": "المصروف غير موجود",
  "Expired": "منتهي الصلاحية",
  "Export request not found": "طلب التصدير غير موجود",
  "Forbidden": "غير مصرّح لك بهذا الإجراء",
  "Grade level not found": "الصف الدراسي غير موجود",
  "Grade not found": "الدرجة غير موجودة",
  "Group not found for this teacher": "المجموعة غير موجودة لدى هذا المدرّس",
  "Hall not found at this center": "القاعة غير موجودة في هذا السنتر",
  "Idempotency key belongs to another payer": "مفتاح التكرار يخص دافعًا آخر",
  "Idempotency key belongs to another user": "مفتاح التكرار يخص مستخدمًا آخر",
  "Intent vanished during settlement": "اختفى طلب الدفع أثناء التسوية",
  "Invalid internal secret": "المفتاح الداخلي غير صحيح",
  "Invalid or expired family code": "كود العائلة غير صحيح أو منتهي الصلاحية",
  "Invalid reset token": "رمز إعادة التعيين غير صحيح",
  "Invite code not found": "كود الدعوة غير موجود",
  "Invited user not found": "المستخدم المدعو غير موجود",
  "Invoice not found": "الفاتورة غير موجودة",
  "Lesson not found": "الحصة غير موجودة",
  "Link not found": "الربط غير موجود",
  "Material file not found": "ملف المادة غير موجود",
  "Material link not found": "رابط المادة غير موجود",
  "Material not found": "المادة التعليمية غير موجودة",
  "Message not found": "الرسالة غير موجودة",
  "Multiple sessions present": "توجد أكثر من جلسة مفتوحة",
  "New time slot conflicts with existing sessions": "الموعد الجديد يتعارض مع حصص موجودة",
  "No attendance found with this teacher": "لا يوجد حضور مسجّل مع هذا المدرّس",
  "No center scope": "لا يوجد نطاق سنتر",
  "No completed charge found for this student and lesson":
    "لا توجد عملية دفع مكتملة لهذا الطالب في هذه الحصة",
  "No linked child enrolled in this course": "لا يوجد ابن مرتبط مسجّل في هذه المجموعة",
  "No linked child is enrolled in this course": "لا يوجد ابن مرتبط مسجّل في هذه المجموعة",
  "No linked children": "لا يوجد أبناء مرتبطون بحسابك",
  "No onboarding flow for this role": "لا توجد خطوات إعداد لهذا الدور",
  "Not a party to this link": "لست طرفًا في هذا الربط",
  "Not allowed": "غير مسموح",
  "Not allowed to view this student card": "غير مسموح لك بعرض بطاقة هذا الطالب",
  "Not an approved child of this parent": "الطالب ليس ابنًا معتمدًا لولي الأمر هذا",
  "Not authenticated": "لم يتم تسجيل الدخول",
  "Not authorized to approve this link": "غير مصرّح لك باعتماد هذا الربط",
  "Not authorized to blacklist at another center": "غير مصرّح لك بالحظر في سنتر آخر",
  "Not authorized to lift this center blacklist": "غير مصرّح لك برفع حظر هذا السنتر",
  "Not authorized to lift this teacher blacklist": "غير مصرّح لك برفع حظر هذا المدرّس",
  "Not authorized to reject this link": "غير مصرّح لك برفض هذا الربط",
  "Not enrolled in this course": "غير مسجَّل في هذه المجموعة",
  "Not found": "غير موجود",
  "Not linked to this student": "غير مرتبط بهذا الطالب",
  "Not the assigned teacher for this session": "لست المدرّس المسؤول عن هذه الحصة",
  "Not your profile": "هذا ليس ملفك الشخصي",
  "Not your review": "هذا ليس تقييمك",
  "Not your session": "هذه ليست حصتك",
  "Not your student card": "هذه ليست بطاقتك",
  "Note not found": "الملاحظة غير موجودة",
  "Notification not found": "الإشعار غير موجود",
  "Offering already exists": "هذه المادة مضافة لهذا الصف بالفعل",
  "Offering not found": "المادة غير مضافة لهذا الصف",
  "Only a parent can pay from a parent wallet": "الدفع من محفظة ولي الأمر متاح لولي الأمر فقط",
  "Only a student can pay from their own wallet balance":
    "الدفع من رصيد المحفظة متاح للطالب صاحبها فقط",
  "Only a super admin can decide a request on behalf of the platform":
    "البت في الطلب نيابةً عن المنصة متاح لمشرف المنصة فقط",
  "Only a super admin can impersonate": "انتحال الحساب متاح لمشرف المنصة فقط",
  "Only a super admin can verify a date of birth": "توثيق تاريخ الميلاد متاح لمشرف المنصة فقط",
  "Only a super admin can view the app as another user":
    "عرض التطبيق بحساب مستخدم آخر متاح لمشرف المنصة فقط",
  "Only a super admin may act on a student card": "التصرف في بطاقة الطالب متاح لمشرف المنصة فقط",
  "Only super_admin can lift a platform blacklist":
    "رفع الحظر على مستوى المنصة متاح لمشرف المنصة فقط",
  "Only the assigned teacher can cancel this session": "إلغاء الحصة متاح للمدرّس المسؤول عنها فقط",
  "Only the assigned teacher can manage grades for this course":
    "إدارة درجات هذه المجموعة متاحة للمدرّس المسؤول عنها فقط",
  "Only the assigned teacher can manage materials for this course":
    "إدارة مواد هذه المجموعة متاحة للمدرّس المسؤول عنها فقط",
  "Only the assigned teacher can postpone this session":
    "تأجيل الحصة متاح للمدرّس المسؤول عنها فقط",
  "Only the author can edit a note's text": "تعديل نص الملاحظة متاح لكاتبها فقط",
  "Only the author or a team lead can pin a note":
    "تثبيت الملاحظة متاح لكاتبها أو لقائد الفريق فقط",
  "Only the author or a team lead can remove a note":
    "حذف الملاحظة متاح لكاتبها أو لقائد الفريق فقط",
  "Only the initiator can cancel a request": "إلغاء الطلب متاح لمن أنشأه فقط",
  "Only the invited center can respond to this request":
    "الرد على هذا الطلب متاح للسنتر المدعو فقط",
  "Only the invited teacher can respond to this request":
    "الرد على هذا الطلب متاح للمدرّس المدعو فقط",
  "Only the session's teacher can complete it": "إكمال الحصة متاح لمدرّسها فقط",
  "Only the shift's owner can close it": "إغلاق الوردية متاح لصاحبها فقط",
  "Parent is already linked to this student": "ولي الأمر مرتبط بهذا الطالب بالفعل",
  "Parent not found": "ولي الأمر غير موجود",
  "Parent profile not found": "ملف ولي الأمر غير موجود",
  "Parent top-up intent has no payer": "طلب شحن محفظة ولي الأمر غير مرتبط بدافع",
  "Parents only": "لأولياء الأمور فقط",
  "Payment belongs to a different center": "عملية الدفع تتبع سنترًا آخر",
  "Payment intent not found": "طلب الدفع غير موجود",
  "Payment not found": "عملية الدفع غير موجودة",
  "Payout not found": "طلب الصرف غير موجود",
  "Payout request not found": "طلب الصرف غير موجود",
  "Pending invite already exists for this email": "توجد دعوة معلّقة لهذا البريد بالفعل",
  "Phone already in use": "رقم الهاتف مستخدم بالفعل",
  "Points rule not found": "قاعدة النقاط غير موجودة",
  "Push subscription not found": "اشتراك الإشعارات غير موجود",
  "Request already reviewed": "تمت مراجعة الطلب بالفعل",
  "Request not found": "الطلب غير موجود",
  "Resource belongs to a different center": "هذا العنصر يتبع سنترًا آخر",
  "Resource has no center scope": "هذا العنصر غير مرتبط بأي سنتر",
  "Review not found": "التقييم غير موجود",
  "Role not allowed": "هذا الدور غير مسموح له",
  "Room not found": "القاعة غير موجودة",
  "Room not found at this center": "القاعة غير موجودة في هذا السنتر",
  "Schedule conflicts detected": "يوجد تعارض في الجدول",
  "Session belongs to a different center": "الحصة تتبع سنترًا آخر",
  "Session is not at your center": "الحصة ليست في سنترك",
  "Session not found": "الحصة غير موجودة",
  "Session not found on this course": "الحصة غير موجودة في هذه المجموعة",
  "Session not in your center": "الحصة ليست في سنترك",
  "Shell exists for this contact with a different role": "يوجد حساب مبدئي بهذه البيانات بدور مختلف",
  "Shift not found": "الوردية غير موجودة",
  "Source center not found": "السنتر المصدر غير موجود",
  "Staff account is not linked to a center": "حساب الموظف غير مرتبط بأي سنتر",
  "Staff account not found": "حساب الموظف غير موجود",
  "Staff member not found on your team": "الموظف غير موجود في فريقك",
  "Stage not found": "المرحلة الدراسية غير موجودة",
  "Student already enrolled": "الطالب مسجَّل بالفعل",
  "Student already enrolled in this course": "الطالب مسجَّل في هذه المجموعة بالفعل",
  "Student already has an active parent link": "الطالب مرتبط بولي أمر بالفعل",
  "Student already in roster": "الطالب موجود في كشف السنتر بالفعل",
  "Student code not found": "كود الطالب غير موجود",
  "Student is already blacklisted at this center": "الطالب محظور في هذا السنتر بالفعل",
  "Student is blacklisted by this teacher": "الطالب محظور من قِبل هذا المدرّس",
  "Student is blacklisted from the platform": "الطالب محظور من المنصة",
  "Student is not in this center's roster": "الطالب ليس في كشف هذا السنتر",
  "Student is not on the source center's roster": "الطالب ليس في كشف السنتر المصدر",
  "Student not found": "الطالب غير موجود",
  "Student not in roster": "الطالب ليس في كشف السنتر",
  "Center credit top-up intent has no payer": "طلب شحن رصيد السنتر لا يحمل بيانات الدافع",
  "The meeting link must start with http:// or https://": "رابط الحصة لازم يبدأ بـ http:// أو https://",
  "Invalid date filter": "نطاق التاريخ غير صالح",
  "Your account has no student profile to receive the claimed balance":
    "حسابك ليس له ملف طالب لاستلام الرصيد المنقول",
  "This student has set a password — login email and phone can only be changed by the student":
    "هذا الطالب عنده كلمة سر — البريد الإلكتروني ورقم الهاتف الخاصين بالدخول يغيّرهما الطالب بنفسه فقط",
  "Student profile not found": "ملف الطالب غير موجود",
  "Student top-up intent has no student to credit": "طلب شحن المحفظة غير مرتبط بطالب",
  "studentId required for admin": "يجب تحديد الطالب عند التنفيذ بحساب مشرف",
  "studentId required for parent": "يجب تحديد الطالب عند التنفيذ بحساب ولي أمر",
  "Students and parents only": "للطلاب وأولياء الأمور فقط",
  "Students only": "للطلاب فقط",
  "Subject not found": "المادة غير موجودة",
  "Subject request not found": "طلب المادة غير موجود",
  "Subscription not found": "الاشتراك غير موجود",
  "Subscription vanished during settlement": "اختفى الاشتراك أثناء التسوية",
  "System not found": "النظام التعليمي غير موجود",
  "Teacher already has an active or pending affiliation": "المدرّس لديه ارتباط نشط أو معلّق بالفعل",
  "Teacher is already linked to this center": "المدرّس مرتبط بهذا السنتر بالفعل",
  "Teacher is not affiliated with this center": "المدرّس غير مرتبط بهذا السنتر",
  "Teacher not found": "المدرّس غير موجود",
  "Teacher not found or not active": "المدرّس غير موجود أو غير نشط",
  "Teacher only": "للمدرّسين فقط",
  "Teacher profile not found": "ملف المدرّس غير موجود",
  "Teachers can only apply as themselves": "يمكن للمدرّس التقدّم باسمه هو فقط",
  "Temp student not found": "الطالب المؤقت غير موجود",
  "That lesson is not taught by this teacher": "هذه الحصة ليست من تدريس هذا المدرّس",
  "This account has no password to change": "هذا الحساب ليس له كلمة مرور لتغييرها",
  "This assistant is already on your team": "هذا المساعد في فريقك بالفعل",
  "This email belongs to an existing account with a different role":
    "هذا البريد يخص حسابًا موجودًا بدور مختلف",
  "This email is already in use": "هذا البريد الإلكتروني مستخدم بالفعل",
  "This phone number is already in use": "رقم الهاتف هذا مستخدم بالفعل",
  "This phone or email already belongs to an account with a different role":
    "هذا الهاتف أو البريد يخص حسابًا بدور مختلف",
  "This role has no session scope on this route": "هذا الدور ليس له صلاحية على هذا المسار",
  "This staff member is already on your team": "هذا الموظف في فريقك بالفعل",
  "This student is not blocked at this center": "هذا الطالب غير محظور في هذا السنتر",
  "This student was just created by someone else — search again to find them":
    "أنشأ شخص آخر هذا الطالب للتو — ابحث مجددًا للعثور عليه",
  "This teacher is already on the platform — send them a collaboration request instead":
    "هذا المدرّس موجود على المنصة بالفعل — أرسل له طلب تعاون بدلًا من ذلك",
  "This teacher is already registered — send them a collaboration request instead":
    "هذا المدرّس مسجّل بالفعل — أرسل له طلب تعاون بدلًا من ذلك",
  "Track already linked to this grade level": "الشعبة مرتبطة بهذا الصف بالفعل",
  "Track not found": "الشعبة غير موجودة",
  "Transaction not found": "الحركة المالية غير موجودة",
  "User is already an admin of this center": "المستخدم مشرف على هذا السنتر بالفعل",
  "User is already platform-blacklisted": "المستخدم محظور من المنصة بالفعل",
  "User not found": "المستخدم غير موجود",
  "Validation failed": "البيانات المدخلة غير صحيحة",
  "You already have a pending deletion request": "لديك طلب حذف معلّق بالفعل",
  "You already have an off-system teacher with these details":
    "لديك مدرّس خارج المنصة بهذه البيانات بالفعل",
  "You are not enrolled in this course": "أنت غير مسجَّل في هذه المجموعة",
  "You are not on this center's roster": "أنت لست في كشف هذا السنتر",
  "You cannot remove yourself as admin": "لا يمكنك إزالة نفسك من الإشراف",
  "You cannot request enrollment in this course": "لا يمكنك طلب التسجيل في هذه المجموعة",
  "You have already blacklisted this student": "لقد حظرت هذا الطالب بالفعل",
  "You may only act on your own data": "يمكنك التصرف في بياناتك أنت فقط",
  "You must have at least one present attendance for this teacher":
    "يجب أن يكون لديك حضور واحد على الأقل مع هذا المدرّس",
  "You must have attended this lesson to rate it": "يجب أن تكون قد حضرت هذه الحصة لتقييمها",

  "Another account already uses this email": "حساب آخر يستخدم هذا البريد الإلكتروني بالفعل",
  "Another account already uses this phone number": "حساب آخر يستخدم رقم الهاتف هذا بالفعل",
  "Invalid public handle": "الاسم العام غير صالح",
  "No center on this session": "لا يوجد سنتر مرتبط بهذه الجلسة",
  "Only a center admin or a teacher owns a public handle":
    "الاسم العام يملكه مسؤول السنتر أو المدرّس فقط",
  "This public handle is already taken": "هذا الاسم العام محجوز بالفعل",
  "This teacher has no profile row — profile fields cannot be edited":
    "هذا المدرّس ليس له ملف شخصي — لا يمكن تعديل بيانات الملف",
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
    re: /^Cannot (.+) a center in status '(.+)' — use the registration flow$/,
    ar: (m) =>
      `لا يمكن تنفيذ "${m[1]}" على سنتر في حالة "${m[2]}" — استخدم مسار التسجيل`,
    sample: "Cannot suspend a center in status 'pending' — use the registration flow",
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
    re: /^Invalid Egyptian mobile number: (.+)$/,
    ar: (m) => `رقم موبايل مصري غير صحيح: ${m[1]}`,
    sample: "Invalid Egyptian mobile number: 12345",
  },
  {
    re: /^Invalid guardian mobile number: (.+)$/,
    ar: (m) => `رقم موبايل ولي الأمر غير صحيح: ${m[1]}`,
    sample: "Invalid guardian mobile number: 12345",
  },
  {
    re: /^No recognised name column\. .*Columns found: (.*)$/,
    ar: (m) => `لم نجد عمودًا للاسم. لازم يكون في الملف صف عناوين فيه عمود للاسم (مثل «الاسم» أو «اسم الطالب»). الأعمدة الموجودة: ${m[1]}`,
    sample: "No recognised name column. The file needs a header row with a name column (e.g. \"name\" or \"الاسم\"). Columns found: كود, موبايل",
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
  {
    re: /^Center staff role '(.+)' is not allowed on this route$/,
    ar: (m) => `دور موظف السنتر "${m[1]}" غير مسموح له على هذا المسار`,
    sample: "Center staff role 'receptionist' is not allowed on this route",
  },
  {
    re: /^Role '(.+)' is not allowed \(need one of: (.+)\)$/,
    ar: (m) => `الدور "${m[1]}" غير مسموح له (الأدوار المسموح بها: ${m[2]})`,
    sample: "Role 'student' is not allowed (need one of: center_admin, teacher)",
  },
  {
    re: /^Room is already (.+)$/,
    ar: (m) => (m[1] === "active" ? "القاعة مفعّلة بالفعل" : m[1] === "inactive" ? "القاعة معطّلة بالفعل" : `القاعة بالفعل في حالة "${m[1]}"`),
    sample: "Room is already inactive",
  },
  {
    re: /^These fields are not editable here: (.+)$/,
    ar: (m) => `هذه الحقول غير قابلة للتعديل من هنا: ${m[1]}`,
    sample: "These fields are not editable here: status, walletBalance",
  },
  {
    re: /^Unknown report '(.+)'$/,
    ar: (m) => `تقرير غير معروف: "${m[1]}"`,
    sample: "Unknown report 'weekly'",
  },
  {
    re: /^code '(.+)' already exists$/,
    ar: (m) => `الكود "${m[1]}" موجود بالفعل`,
    sample: "code 'MATH-1' already exists",
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
  "Center is already ${center.status}",
  'Invalid category. Must be one of: ${EXPENSE_CATEGORIES.join(", ")}',
  "Invalid letter grade: ${letter}",
  "Mock signature failed: ${verification.error}",
  "Payout is already ${exists.status}",
  "Payout is already ${current.status}",
  "Payout is already ${current2.status}",
  "Request already ${existing.status}",
  "Request already ${req.status}",
  "Request is already ${request.status}",
  "Teacher is already ${u.status}",
  "This request is already ${row.status}",
  "Unknown cron job: ${job}",
  "Unsupported invoice type: ${input.type}",
  "User is a '${user.role}', not a ${kind}",
  "User is a '${user.role}', not a teacher",
  "You cannot ${what} your own account",
  "Amount exceeds available balance (${(available / 100).toFixed(2)} EGP available)",
  "Cannot ${action} a center in status '${center.status}' — use the registration flow",
  "Maximum top-up cannot exceed ${(ABSOLUTE_MAX / 100).toLocaleString()} EGP",
  "Maximum top-up is ${(settings.maxTopup / 100).toFixed(2)} EGP",
  "Minimum top-up is ${(settings.minTopup / 100).toFixed(2)} EGP",
  "Score ${entry.score} for student ${entry.studentId} is out of range [0, ${existing.maxScore}]",
  "Score ${entry.score} is not a valid letter grade value (0-4 mapping to F-A)",
  "Score must be between 0 and ${grade.maxScore}",
  "Student ${entry.studentId} is not enrolled in this course",
  "This file has ${rows.length} rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it and import each part.",
  "Invalid Egyptian mobile number: ${raw}",
  "Invalid guardian mobile number: ${raw}",
  "This teacher is owed ${(profile.walletBalance / 100).toFixed(2)} EGP — you cannot settle more than that",
  "Top-up must be between ${MIN_TOPUP / 100} and ${MAX_TOPUP / 100} EGP",
  "Your hall's per-student share may not exceed the platform maximum of ${ceiling.bp / 100}%",
  "Your hall's per-student share may not exceed the platform maximum of ${ceiling.fee! / 100} EGP",
  "Center is already ${next}",
  "Center staff role '${staffRole}' is not allowed on this route",
  'Role \'${user.role}\' is not allowed (need one of: ${allowed.join(", ")})',
  'Room is already ${isActive ? "active" : "inactive"}',
  'These fields are not editable here: ${illegal.join(", ")}',
  "Unknown report '${report}'",
  "code '${code}' already exists",
  "code '${resolution.newSubject.code}' already exists",
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
