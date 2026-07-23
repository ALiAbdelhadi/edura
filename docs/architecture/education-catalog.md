# الكتالوج التعليمي + الـ Onboarding — دليل سريع

نظام config-driven بالكامل: الأنظمة/المراحل/الصفوف/الشعب/المواد بيانات في الـ DB بتتدار من لوحة الـ super_admin — **مفيش أي إضافة نظام أو مادة محتاجة تعديل كود أو deploy**.

## البنية

```
education_systems → stages → grade_levels ←→ tracks (عبر grade_level_tracks)
subjects ←→ subject_offerings (المادة دي بتتدرّس في أنهي صف/شعبة — track NULL = كل الشعب)
student_profiles: education_system_id + stage_id + grade_level_id + track_id? + second_language_subject_id?
teacher_grade_levels / teacher_subjects: صفوف ومواد المدرس (many-to-many)
center_stages: المراحل اللي السنتر بيغطيها
subject_requests: طلبات "أضيفوا مادة" من المدرسين
```

- كل الجداول فيها `is_active` (إخفاء من غير حذف) + `sort_order` (ترتيب الظهور) + `code` ثابت للـ seeding.
- منطق الـ wizard كله data-driven: الصف بيسأل عن شعبة **فقط** لو له صفوف في `grade_level_tracks`، وخطوة اللغة الثانية بتظهر **فقط** لو المرحلة `has_second_language`.
- RLS: جداول الكتالوج قراءة للجميع وكتابة تحت `rls_bypass()` بس (لوحة الـ super_admin).

## إزاي تضيف نظام تعليمي جديد (مثلاً "فني") من غير أي كود

1. ادخل بحساب super_admin → **الكتالوج التعليمي** من القائمة الجانبية.
2. تاب **الهيكل** → "إضافة نظام" → code ثابت (مثلاً `technical`) + الاسم بالعربية.
3. اختَر النظام → "إضافة مرحلة" (فعّل "تتطلب لغة ثانية" لو محتاجة).
4. اختَر المرحلة → "إضافة صف" لكل صف (level = ترتيبه داخل المرحلة).
5. لو فيه شعب: "إضافة شعبة" ثم اربطها بالصفوف اللي بتسأل عنها من "ربط شعبة بالصف" على كارت الصف.
6. تاب **عروض المواد** → "إضافة عرض" لربط كل مادة بالصف (والشعبة لو مش لكل الشعب).

النظام الجديد هيظهر **فوراً** في wizard الطالب والمدرس والسنتر.

## إزاي تضيف مادة جديدة

1. تاب **المواد** → "إضافة مادة" → code + اسم (+ علامة "شرعية/أزهري" أو "خيار لغة ثانية" لو ينطبق).
2. تاب **عروض المواد** → اربطها بالصفوف/الشعب اللي بتتدرّس فيها.
3. طلبات المدرسين ("مش لاقي مادتك؟") بتظهر في تاب **طلبات المواد** — اعتمدها كمادة جديدة أو اربطها بمادة موجودة.

## نقاط الدخول في الكود

| الجزء | المكان |
|---|---|
| الـ models | [schema.prisma](../../packages/database/prisma/schema.prisma) (قسم EDUCATION CATALOG) |
| الـ migration | `packages/database/prisma/migrations/20260714142944_education_catalog/` |
| الـ seed المصري | [seed-catalog.ts](../../packages/database/prisma/seed-catalog.ts) (idempotent — upsert بالـ code) |
| Admin API | `apps/www/src/app/api/v1/admin/catalog/*` (super_admin) |
| قراءة الكتالوج | `apps/www/src/app/api/v1/catalog/{tree,subjects}` + `lib/services/catalog/catalog-read.ts` |
| الـ onboarding | `apps/www/src/app/api/v1/me/onboarding` + `lib/services/catalog/onboarding.ts` |
| الـ wizards | `apps/www/src/features/onboarding/` + صفحة `/{locale}/onboarding` |
| لوحة الأدمن | `apps/www/src/features/admin/catalog/` + `/dashboard/superadmin/catalog` |

## ملاحظات

- الـ registration فاضل خفيف عمداً — كل البيانات التعليمية بتتجمع في wizard بعد أول دخول (الـ `OnboardingGate` في dashboard layouts بيحوّل تلقائياً لو `onboarding_completed = false`)، مع حفظ تلقائي للمسودة.
- الطالب بعد الـ onboarding بيشوف في البحث الكورسات المطابقة لصفه/شعبته بس (الكورسات القديمة غير المربوطة بالكتالوج بتفضل ظاهرة لحد ما تتربط).
- علاقة المدرس بالسنتر اختيارية — موجودة أصلاً عبر `center_teacher_affiliations`.
- الحقول القديمة (`student_profiles.grade`، `teacher_profiles.subjects[]`، `courses.subject/grade_tag`) متعلّمة DEPRECATED وبتتظبط تلقائياً عند إكمال الـ onboarding للتوافق مع الشاشات القديمة لحد الـ backfill.

## الاختبارات

```bash
pnpm --filter edura test                 # unit (منطق خطوات الـ wizard)
pnpm --filter edura exec tsx --env-file=.env.local tests/db/catalog-onboarding.test.ts  # acceptance ضد Neon
```
