# Edura — payment walkthrough for the Paymob review

Edura is a platform for private lessons in Egypt (secondary school). A teacher
runs groups of lessons and sets a price for each one. A student pays for the
group, either for the month or for one lesson at a time. A parent can pay
instead of the child. Every online payment goes by card through Paymob,
straight to the lesson being bought. Nobody keeps a stored balance or tops one
up.

The app is in Arabic. Switch to English with the **English** button at the top
of any page.

## Test accounts

| Role | Email | Name |
|---|---|---|
| Teacher | `review.teacher@edura.demo` | أ. نهى الشريف |
| Student | `review.student@edura.demo` | عمر خالد |
| Parent (of عمر) | `review.parent@edura.demo` | خالد إبراهيم |

The password is sent separately. The student and the parent are already
linked. The teacher already has two priced groups with upcoming lessons.

## 1. The teacher sets the price

1. Log in as the teacher.
2. Open **My Classes** (الفصول) and choose **Create group** (إنشاء مجموعة).
3. Fill in the subject, the days and the time. Then set both prices:
   - **Monthly price** (السعر الشهري): the price of one month of lessons.
   - **Per-session price** (سعر الحصة): the price of a single lesson.
4. Save. The group now shows to every student in that grade and track, with
   both prices on it.

The teacher only sets prices. The teacher never takes a payment by hand.

## 2. The student books and pays

1. Log in as the student.
2. Open **My subjects** (موادي) and expand a subject, for example
   **Biology** (الأحياء). The teacher's group shows with both prices.
3. Choose one of the two:
   - **Subscribe monthly** (اشترك شهريًا · 400 EGP), or
   - pick a date under **Choose a lesson** (اختر الحصة), then
     **Book a lesson** (احجز حصة · 120 EGP).
4. Edura opens the Paymob card checkout for that exact amount.
5. After a successful payment the subscription is active right away.
   **My subscriptions** (اشتراكاتي) shows it with its end date, and the
   receipt (for example `RCP-EDURA-2026-00001`) can be downloaded from the same
   page.

A declined or cancelled card leaves nothing active, and no receipt is issued.

## 3. The parent pays for the child

1. Log in as the parent.
2. Open **Pay for a lesson** (ادفع لدرس). The page shows the child's subjects.
   Subjects the child already pays for are marked **Active** (شغّال).
3. Expand a subject, for example **Chemistry** (الكيمياء), and choose
   **Pay monthly** (ادفع شهري) or pick a date and choose
   **Pay for this lesson** (ادفع هذا الدرس).
4. Confirm. The only option is **Pay by card** (ادفع بالكارت), which opens the
   Paymob checkout.
5. After payment the child's lesson is active. **Fees** (الرسوم) lists every
   payment made for the child, with its receipt.

The payment is recorded as paid by the parent for the child. It activates the
child's lesson, the same as if the child had paid.

## What happens to the money

- Every payment is for one named purchase: a month of one group, or one lesson
  of one group. The amount is the teacher's price for it.
- Each payment produces a numbered receipt, which the student and the parent
  can both download.
- Edura pays teachers what their lessons earned, after the lessons take place.
