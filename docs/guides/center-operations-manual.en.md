# Center Operations Manual — Edura

**Who this is for:** the center owner, the center manager, the receptionist, and the center accountant.
**Written so a new administrative hire can be trained from it directly, step by step, on day one.**

---

## About this manual

- **Everything here comes from the product itself** — screens, buttons and messages are quoted exactly as they appear, so nobody hunts for a button under a name it does not have.
- Quoted UI text appears in "quotes". The product ships in Arabic and English; this is the English edition and quotes the English strings.
- **Last updated:** 10 August 2026.
- **Arabic edition, identical in structure:** [center-operations-manual.ar.md](center-operations-manual.ar.md).

### Symbols

| Symbol | Meaning |
|---|---|
| ⚠️ | An irreversible action, or a fact that needs confirmation from the team |
| 📸 | Suggested screenshot before publishing |
| 🔒 | Owner-only — no staff member can do this |

### Read this before anything else

**There is no paid subscription for a center on this platform.** No monthly fee, no activation or setup fee, and no commission on withdrawing your own balance. The platform earns a share of lesson revenue that has actually been collected. So you will not find a "Plans" or "Billing" screen in this manual or in the product. What replaces it is **Section 4: The full money cycle**, which everyone who handles cash at your center must read.

---

## 1. Introduction: what the platform organises for you

A center runs four connected systems in one place:

1. **Halls and teachers** — you register your halls and their prices, and teachers reach you through "Collaboration requests": a request carrying the subject, grade, hall and schedule. Accepting one creates the class *and its full session schedule* in a single step.
2. **Students and attendance** — the center roster, counter check-in (plus a door check-in when the teacher runs two-stage mode), and a student card carrying an eight-character code and a QR that works with a phone camera or an ordinary barcode scanner.
3. **Money** — cash at the counter against a numbered receipt, or online payment by the student/parent, then automatic distribution when a lesson is closed: the platform's share, your hall's share, and the remainder to the teacher. Your share lands in the center wallet, and you withdraw it with a payout request.
4. **Team and oversight** — staff accounts with preset roles, a team notes board, and an audit log recording every sensitive action with who did it and when.

**What makes this different from a paper ledger:** every amount is written into a ledger that cannot be edited or deleted — not even by the platform's own administrators. The only correction after recording is **a new reversing entry**, and the original mistake stays visible. Accuracy at the moment of recording is therefore not a detail; it is the job.

### The two portals

| Portal | Who | URL |
|---|---|---|
| Center owner portal | The account that registered the center | `/dashboard/admin` |
| Staff portal | The three staff account types | `/dashboard/staff` |

Staff never enter the owner portal and vice versa, and the menu inside the staff portal changes with the staff member's role.

---

## 2. First-time setup (onboarding)

This is the correct order. Skipping a step makes the next one impossible: you cannot create a class without a teacher and a hall, and you cannot take money for a class that has no price.

### 2.1 Create the center account

1. Open `/register`.
2. Under "I am", choose **"Center"** (described as "I want to register my educational center").
3. Fill in:
   - "Full name" — yours, the account holder's, not the center's.
   - "Email" — this is your sign-in address and where every official message goes.
   - "Phone (optional)" — format `01xxxxxxxxx`.
   - "Center name" — e.g. "Nile Learning Academy".
   - "Address (optional)".
   - "Password" — at least 8 characters — then "Confirm password".
4. Submit. Below the form you accept the "Terms of Use" and "Privacy Policy".
5. **What happens next:** your account is created in a pending state and you cannot sign in yet.

**Expected errors:**

| Message | Cause | What to do |
|---|---|---|
| "Please enter a valid email" | Typo | Fix the address |
| "Password must be at least 8 characters" | Too short | Lengthen it |
| "Passwords do not match" | Confirmation differs | Retype it |
| "Registration failed. Please try again." | Email already used, or a transient fault | Try another address or retry |

📸 [Screenshot: `/register` with the "Center" role selected and the center-name and address fields visible]

---

### 2.2 Platform review of your account

This step happens at Edura, not at your desk.

1. Try signing in at `/login`.
2. If the account is still under review you will read, verbatim: **"Your account is still under review by the Edura team. We'll notify you as soon as it is approved, and you can sign in then."**
3. Wait for the approval notification, then sign in again.

**Tell these two apart carefully:**

- "Your account is still **under review**…" — the normal state for a new account. Do nothing but wait.
- "Your account is currently **inactive**. Contact support or your center to reactivate it." — not a new-account state at all. It means the account was disabled. Contact support.

**Other sign-in messages:**
- "Invalid email or password" — wrong credentials.
- "Too many attempts — please wait a moment and try again." — you exceeded the attempt limit. Wait; do not keep pressing.

**What reaches you when the decision is made:** an approval activates the account and sends you a "Registration approved" notification. A rejection **cannot happen without a reason** — the server itself refuses a rejection carrying an empty one (max 500 characters) — and you receive a "Registration not approved" notification **with that reason quoted inside it**.

⚠️ [Needs confirmation from the team: the expected review turnaround (hours? one business day?) so we can print it instead of "wait for the notification".]

📸 [Screenshot: the sign-in screen with the "under review" message below the form]

---

### 2.3 The center profile wizard (three steps)

After approval and your first successful sign-in you are sent straight to the wizard, and you cannot reach the dashboard until it is finished.

**Step 1 — "Center details":**
1. "Center name".
2. "Governorate" — pick from the searchable list.
3. "Area" — disabled until a governorate is chosen; pressing it first reads "Select a governorate first".
4. "Phone".
5. Press "Next".

**Step 2 — "Stages you cover":**
1. Pick every educational stage your center serves (more than one is fine).
2. Press "Next".

**Step 3 — "Review":**
1. Check the name, governorate, area, phone and stage count.
2. Press "Confirm & save".
3. "Your profile has been saved!" appears and you land on `/dashboard/admin`.

**Worth knowing:**
- **Progress is saved automatically.** You can close the browser and come back; you will read "We restored your previous selections".
- A "Back" button is available between steps.

**To change any of this later:** Settings → the **"Center details"** card (see 3.17). Name, governorate, area, phone, WhatsApp, email and address are all editable there at any time.
> **Covered stages** are the one field that stays in the wizard; to change them open `/en/onboarding?edit=1` — a direct URL that no menu links to.

📸 [Screenshot: the "Review" step with the "Confirm & save" button]

---

### 2.4 Understand how the money moves — before you collect a single pound

**Read Section 4 in full before opening the counter.** The short version:

1. **You pay the platform nothing up front.** No monthly subscription, no activation fee, no setup fee, no withdrawal commission, and nothing charged to the student on top of the lesson price.
2. **The platform's share comes out of the lesson itself, after the money arrives** — never before.
3. **Your share** comes from the pricing of the hall the lesson is taught in, is calculated when the lesson is **closed**, and only for students **actually present**.
4. **Rates freeze when a class is created.** Changing your hall price today never re-prices an existing class; it applies to new classes only.
5. **A lesson nobody attended costs you nothing and earns you nothing.**

**Where to read your own rate:** open the public **`/pricing`** page ("How we charge"). Its figures are **not written into the page** — they are read from platform settings the moment you open it and computed by the same functions that settle real money, and the page says so itself: "The figures in these examples are read from the platform's own settings right now — they are not written into the page."
**How the pricing itself works:** the platform holds a global figure, and a specific figure may be set **for your center** or **for an individual teacher**; precedence is teacher → center → global. The defaults written in the code are **15% on an independent-teacher subscription** and **2 EGP per attending student** on each of the teacher and center sides — but do not treat those as yours: open `/pricing`, or ask the platform for your center's rate.

---

### 2.5 Register your halls and price them

Halls come first in practice, because a teacher picks a hall when requesting collaboration, and the hall's price is your share of every lesson.

1. In the sidebar open **"Rooms"** (`/dashboard/admin/rooms`).
2. Press "Add Room".
3. Fill in:
   - "Room Name" (required) — e.g. "Room A".
   - "Capacity" — seats, e.g. 30.
   - "Hall price (EGP)" — "Shown to teachers when they book this room. This is not the revenue split."
   - "Description" and "Features / amenities" (optional).
   - **"Allowed pricing methods"** — the most consequential field; see step 4.
4. **Choose one or both pricing methods:**
   - **"Whole-room percentage"** — the hall takes a fixed percentage of each lesson, and the percentage is set by the platform.
   - **"Per attending student"** — the hall's share is calculated per student who actually attends. Here **you** enter "This hall's share per attending student", but bounded by a platform ceiling printed under the field: "Platform maximum: {…}".
   - The rule on screen: "One method = teachers must use it. Both = the teacher chooses when booking."
5. Press "Create". "Room created" appears.
6. **Photos come after saving**, as the screen says: "Save the room first, then add photos by editing it." Open "Edit Room" then "Add photo".

**Special cases:**
- "Per-attending-student pricing is unavailable — the platform has not set its rate for this hall yet": that method is off until the platform sets a rate. Use the percentage, or contact the platform.
- "This method is enabled but the platform no longer sets a rate for it — the hall cannot be saved until you uncheck it": uncheck it to save.
- Photo limits: JPEG/PNG/WebP/AVIF only, with a size limit and a per-room count limit, each with an explicit message.

⚠️ **You cannot undo deleting a hall yourself** (and it is refused outright while the hall still has upcoming sessions) — details in 3.9.

⚠️ Editing "this hall's share per attending student" **changes no existing class**: "Frozen onto a class when it is created, so changing it never re-prices an existing class."

📸 [Screenshot: the Add Room form showing "Allowed pricing methods" and the platform maximum]

---

### 2.6 Add teachers

There are **three entirely different routes**. Pick the right one:

#### Route (a) — invite a teacher onto the platform

For a teacher willing to use the platform with their own account.

1. Go to **"Teachers"** (`/dashboard/admin/teachers`).
2. Press "Invite Teacher".
3. Enter "Email" (required) and "Name (optional)".
4. Press send. "Invitation sent" appears.
5. The teacher shows in the table as "Pending Invite" until they open the invite and set their own password.
6. If they are slow, press "Re-invite" in the actions column.

#### Route (b) — a collaboration request (this is what actually creates a class)

An invite only gives the teacher an account. **A class is born only from an accepted collaboration request**, and the "Collaboration requests" panel lives inside the Teachers page itself.

**To send a request:**
1. On "Teachers", in the "Collaboration requests" panel, press **"Invite a teacher"**.
2. Fill in: "Pick a teacher…", "Subject", "Grade", "Track" (or "All tracks"), "Hall (optional)", "Days", "From" and "To" (times), "Start date", "Expected students" (optional), "Message" (optional).
3. Press "Send request". "Collaboration request sent" appears.

**To accept an incoming request:**
1. Incoming requests are tagged "Incoming — your decision".
2. Press "Accept". The confirmation reads: "Accepting creates the affiliation, the class, and its full session schedule in one step."
3. Confirm. You will see: **"Accepted — class and schedule created. Set prices so students can subscribe."**
4. **The next step is mandatory:** go to "Classes" and price the new class — see 2.7.

**About the center's share here:** the screen states plainly, "The center's share is set by the platform. Neither the teacher nor the center enters an amount." And where a hall offers both methods: "This hall offers both pricing methods — the teacher chooses one when accepting."

**Expected errors:** "Pick the other party, subject, grade, at least one day, and a start date" — a missing field. "This center has no halls listed yet" — go back to 2.5.

#### Route (c) — an off-system teacher (who wants nothing to do with the platform)

For a teacher who refuses the platform or keeps their own system; you enter everything by hand. Full detail in **3.18**, reached from the sidebar entry **"Off-system teachers"**, directly under "Teachers".

📸 [Screenshot: the Teachers page showing the teacher table and the "Collaboration requests" panel]

---

### 2.7 Price your classes (without this, nobody can subscribe)

A class created by accepting a collaboration request is born **with no price**, and nobody can subscribe to it.

1. Open **"Classes"** (`/dashboard/admin/classes`).
2. If any class is unpriced, a banner appears at the top: "Some classes have no monthly or per-session price — students cannot subscribe until you set one (edit the class)." The class itself carries the tag "No subscription price".
3. Open the class, then "Edit Course".
4. Set at least one price:
   - "Monthly plan price (EGP)".
   - "Per-session price (EGP)".
   - The rule on screen: "Empty = plan disabled".
5. Set **"What is one lesson worth?"** — a real money decision, explained on screen: "This class carries a full-course price and a single-lesson price, and they can differ. This choice decides the amount distributed when each lesson is closed — it applies to future lessons only; lessons already settled never change." The options:
   - **"Course price ÷ number of lessons"** — the default.
   - **"Single-lesson price"**.
   - **"Each student's own subscription"** — every present student settles at what they personally paid.
6. Save. "Course updated" appears.

⚠️ **Subject and teacher cannot be changed after creation** — the screen says exactly that: "Subject and teacher can't be changed after creation."

📸 [Screenshot: the "Some classes have no monthly or per-session price…" banner above the class table]

---

### 2.8 Get students in

Three ways, each with its place:

**(a) Import a whole roster from a file** — the right move when migrating off an old system. Recipe 7 in Section 6.
**(b) Invite a student by email** — "Students" → "Invite Student".
**(c) Register a walk-in at the counter** — mid-shift, straight from the counter board. Recipe 4.

**⚠️ The single most important safety rule in the product:** a minor (under 18) whose guardian has **no email on file** has **messaging with teachers and staff switched off**. Classes, payments and attendance are entirely unaffected. The product's own words: "Messaging with teachers and staff stays off until then — classes and payments are unaffected." So: **ask for the guardian's email at every new registration.**

---

### 2.9 Create staff accounts

1. Open **"Staff"** (`/dashboard/admin/staff`).
2. Press "Add staff member".
3. Fill in "Name", "Email" and "Phone", pick a "Role", and optionally a "Title (optional)" such as "Front desk, Morning shift".
4. Press "Create".
5. **You do not set a password for them.** The screen states: "The staff member sets their own password from an emailed invite link — you never see it."
6. They appear tagged "Invite pending" until they open the link and set a password.
7. If the email does not arrive, press "Resend invite". The warning reads: "The previous link stops working immediately."

**The three roles, as the product defines them:**

| Role | Verbatim description |
|---|---|
| **Receptionist** | "Counter check-in, walk-in registration, cash wallet top-ups, and student lookup." |
| **Manager** | "Everything a receptionist can do, plus room management, collaboration requests, and operational reports." |
| **Center Accountant** | "Read-only view of this center's financial reports and ledger. No changes." |

🔒 **And what no staff member can ever do**, verbatim: "Never allowed for any staff: wallet withdrawals, pricing & revenue split, center settings, and managing staff — those stay with you."

📸 [Screenshot: the Staff page with a member tagged "Invite pending" and the "Role permissions" panel beside it]

---

### 2.10 Setup checklist

- [ ] Account created, approval received, sign-in works.
- [ ] Center profile wizard complete (name / governorate / area / phone / stages).
- [ ] Every hall registered, each with a price and at least one pricing method.
- [ ] Teachers invited, or registered as off-system teachers.
- [ ] Collaboration requests accepted and classes created.
- [ ] **Every class has a monthly or per-session price** — no class carries "No subscription price".
- [ ] "What is one lesson worth?" chosen for every class.
- [ ] Student roster imported or entered.
- [ ] Staff accounts created and their invites claimed.
- [ ] Two-factor authentication enabled on your own account (Settings).
- [ ] One full dry run: a single student, a cash collection, a check-in, a lesson close, and your share visible in the center wallet.

---

## 3. Page-by-page tour — the center owner portal

Every page opens from the sidebar. On a phone, four icons sit in a bottom bar (Overview / Counter / Check-in / Students / Fees) and everything else lives under "More".

---

### 3.1 Page: Overview

**Purpose and when to use it:** the first screen every morning. It answers one question — "what is waiting on my decision today?" — and is not a wall of decorative numbers.

**How to get there:** "Overview" at the top of the sidebar, or `/dashboard/admin`.

**What is on the page:**
1. **The decision headline** — e.g. "3 decisions waiting today", or "No decisions waiting today". Beneath it: "Every money action here is written into the center's ledger immediately. Review, then approve."
2. **Decision cards** — three, each with a count and a sentence about its consequence:
   - "Enrolment requests awaiting a reply" — "Each one keeps a student out of their sessions."
   - "Students behind on fees" — "An unpaid student is not counted present until settled." Tagged "Blocks attendance".
   - "Sessions today" — "Open the counter to check in and collect."
   - And when nothing is pending: "Nothing is waiting on you. The record is up to date."
3. **"Center ledger"** — "Total revenue", and "On the roster": students, teachers and classes. If you have off-system teachers, a line reads "Off-system share: {amount} · {n} teachers".
4. **"Today"** — "Attendance rate" and "Scheduled sessions".
5. **Charts** — "Revenue vs Expenses trend", "Session status mix", "Attendance by course".

**Actions:** this screen is **read-and-route only**. Press a decision card to land on the screen where the work is done.

**Who can do this:** the owner. (A manager has their own version in the staff portal, **with the financial figures stripped out**.)

**Special cases:** the charts start empty and read "No financial data yet" — normal for a new center, not a fault.

📸 [Screenshot: the Overview with three open decision cards and the "Center ledger" panel]

---

### 3.2 Page: Counter board

**Purpose and when to use it:** the screen a receptionist lives on for a whole shift. It starts from the **lesson**: pick the teacher, today's lessons appear, then the roster is ready to check in and collect. Screen description: "Pick the teacher — today's lessons and the roster come up ready to check in."

**How to get there:** "Counter" in the sidebar, or `/dashboard/admin/counter` (staff: `/dashboard/staff/counter`).

**What is on the page:**
1. **The context line** — teacher · time · group · hall, with a "Change" button. It opens by itself when no lesson is chosen yet.
2. **Teacher picker** — with "Search by teacher name…".
3. **Today's lesson chips** — a horizontal row; the live one is tagged "Running now".
4. **Two tabs:** "Checked in" and "All students", each with its count.
5. **Student finder row** — "Student name, code or phone…", a "Search" button, a "Scan card" camera button, and a walk-in registration button.
6. **A waiting line above the roster** — "{count} awaiting door check-in".
7. **The roster** — each row: name, status tags ("Not enrolled in the group" / "Unpaid"), and the action button in a fixed-width column.

**Action 1 — check in a student who has already paid:**
1. Pick the teacher, then the lesson.
2. On "All students", search by name.
3. Press "Check in".
4. "Checked in — present" appears and the student moves to the "Checked in" tab.

**Action 2 — collect cash and check in, in one step:**
1. The student carries the "Unpaid" tag.
2. Press the button that names the amount: "Collect {price} & check in".
3. A panel confirms: "This session is unpaid — {course} is not covered for this student. Collect the session fee in cash now and attendance is recorded in the same step."
4. Press "Collect {price} in cash" — **this press only arms the button**.
5. **Physically take the money**, then press "Confirm — {price} received".
6. "Cash payment recorded" appears, then "Checked in — present".

⚠️ **Step 5 is final.** On confirmation the amount is written into the center's ledger and a numbered receipt is issued. There is no undo — the only correction is a new reversing entry (a refund).
> To disarm before confirming, press `Escape`.

**Action 3 — reading failure messages:**

| Message | Meaning | What to do |
|---|---|---|
| "No coverage — collect the per-session payment first" | Student not covered | Run Action 2 |
| "The payment was not recorded — nothing was charged. Try again." | Nothing happened at all | Safe to retry |
| **"The cash was collected and written to the ledger, but attendance was not marked. Do NOT collect again — just press 'Check in'."** | **Money in, attendance not** | ⚠️ **Do not collect again.** Press "Check in" only |
| "No per-session price — the center owner sets it on the Classes screen to enable collection here" | Class has no price | 🔒 Owner prices the class (2.7) |
| "Passed the counter — door pending" | Counter done, not complete | The teacher/assistant confirms at the door |

**Action 4 — a student who is not on this lesson's roster:**
1. Type the name; if nothing matches you will read "No student by that name in this lesson" and "Press Search to look across all students by code or phone."
2. Press "Search" — this searches every student on the platform.
3. Results appear under "Not on this lesson's roster", with the same action buttons pointed at the selected lesson.

**Who can do this:** owner, receptionist, manager. ❌ **The center accountant does not see this page at all** — that tier is read-only, so the page is absent rather than disabled.

📸 [Screenshot: the counter board on a live lesson, both tabs with counts, and a student tagged "Unpaid"]

---

### 3.3 Page: Counter check-in

**Purpose and when to use it:** the second door into the same room. The counter board starts from a **lesson**; this starts from a **student**: someone stands in front of you with a card or a code, you find them and then pick their session. Description: "Search a student by code, phone, or name — then pick the session."

**How to get there:** "Check-in" in the sidebar, or `/dashboard/admin/checkin`.

**What is on the page:**
1. Search box: "G7K3M2QF, phone, or name…" plus a "Scan card" button.
2. "Matches" — each result tagged with its relationship to you: "Our student" / "Registered at {center}" / "New here" / "Temp".
3. "Subscribed sessions" and "Today's sessions" — a covered session carries the "Covered" tag.
4. A "New walk-in student" panel at the bottom.

**Action 1 — find and check in:**
1. Scan the card, or type code / phone / name.
2. Pick the student from "Matches".
3. Pick the session under "Today's sessions".
4. Press "Check in", or "Collect {price} & check in" — same logic as 3.2.

**Action 2 — register a walk-in on the spot:**
1. In "New walk-in student", enter "Full name" and "Phone (01XXXXXXXXX)".
2. **Fill in "Guardian contact (optional)"** — "Guardian email" and "Guardian phone". The screen explains why: "Email is what we send the account link to and what enables messaging with teachers. If the guardian has no email, take their phone — we keep it on record."
3. Press "Create temp student". "Temp student created" appears.
4. **With a guardian email:** "Invite emailed to the guardian".
5. **Without one:** "No guardian email — hand the link over in person", and the invite link is shown on screen. **Copy it and hand it to the guardian standing in front of you.**

**Special cases:**
- **Registered at another center:** "Already in the system at {center} — they can keep it or switch after this session (they'll get a prompt)." Do not create a second account.
- **Already yours:** "Already registered — code {code} resent".
- **Minor with no guardian email:** the "A guardian email is still needed" panel appears in full. Record the email as soon as it exists.
- **Camera blocked:** "The camera could not be opened. Type the code instead." (The scan button does not render at all on unsupported browsers such as Safari/iOS.)

**Who can do this:** owner, receptionist, manager. ❌ Not the accountant.

📸 [Screenshot: search results showing all three tags — "Our student", "Registered at …", "New here"]

---

### 3.4 Page: Students (and the student detail record)

**Purpose and when to use it:** the full center roster, the file-import door, and the way into each student's record.

**How to get there:** "Students", or `/dashboard/admin/students`.

**What is on the page:** two counters at the top ("Total students" and "Pending requests"), a search box ("Search by name or email"), and a table with: "Student", "Enrolled courses", "User ID", "Student code", "Joined", "Status", "Actions". An unclaimed account is tagged "Shell".

**Action 1 — invite a student:**
1. Press "Invite Student".
2. Enter the email (required) and "Name (optional)".
3. Send. Description: "Send an invitation email so the student can join and set their password."
4. "Invitation sent to …" appears.

**Action 2 — import from a file:** see Recipe 7 (Section 6).

**Action 3 — open the student record:** press the student's name. The record shows:
- "Student Record": name, phone, status, User ID, roster ID, added date, "Operational Parent" and "Operational Parent Phone".
- "Active classes" and "Total paid".
- The enrolment table, and a "Payments" table with receipt numbers.

**Action 4 — edit the student:** "Edit Student" → name / email / phone → save → "Student updated".

**Action 5 — top up the student wallet in cash:**
1. Press "Top up wallet". Description: "Record a cash top-up to this student's wallet."
2. Enter "Amount (EGP)".
3. Press "Add to wallet". "Wallet topped up" appears.

⚠️ This is real cash entering the ledger. Take the money before you press.

**Action 6 — blacklist a student from the center (two steps):**
1. Press "Blacklist Student".
2. The "Blacklist decision" panel computes "What this does" *before* anything happens: "The student will be withdrawn from {n} active enrolments at your center:" followed by the classes by name. If there are none: "No active enrolments — this only blocks future enrolment."
3. Read the two guarantees printed there:
   - "Every withdrawal is journalled. Lifting the blacklist restores exactly these enrolments — no more, no fewer."
   - "A blacklist touches no payment, subscription or wallet. Nothing is refunded and no subscription is cancelled."
4. Enter "Reason (required)".
5. Press "Blacklist and withdraw {n} enrolments" — **arming only**.
6. Press "Final confirm — apply the blacklist".

⚠️ "On confirm the student loses their place in the sessions above immediately, and the blacklist is recorded in your name in the audit log."
To reverse: press "Un-blacklist" → "Student removed from blacklist".

**Who can do this:** the owner. Receptionists and managers have their own students screen in the staff portal (lookup, view, walk-in registration, wallet top-up).

📸 [Screenshot: the "Blacklist decision" panel listing the enrolments that will be withdrawn]

---

### 3.5 Page: Enrollment Requests

**Purpose and when to use it:** a student asks to join a class and the decision is yours. Description: "Approving enrols the student immediately and opens attendance for them. Declining requires a reason, which is sent to the student."

**How to get there:** "Enrollment Requests", or `/dashboard/admin/enrollment-requests`.

**What is on the page:** a table with "Student", "Class", "Requested", "Status" (and the request's age in days), plus a side panel headed "Enrolment decision".

> **Why the decision lives in a side panel rather than the table row:** the screen explains it — "Decisions are made from this panel, not from table rows — so nothing is approved by a mis-tap while scrolling."

**Action 1 — approve (two steps):**
1. Press the request row. The panel opens; with nothing selected it reads "Select a request to review".
2. Read the clearance line: "The class accepts a new enrolment and nothing blocks this student."
3. Press "Approve enrolment" — **arming only**; the hint reads "Two steps: the first press arms the button, the second enrols."
4. Press "Final confirm — enrol the student".
5. "Request approved" appears.

**Action 2 — decline:**
1. Press "Decline with a reason".
2. Write the reason — required: "Please provide a reason for declining this request." The screen's own example: "e.g. Course is full, student doesn't meet prerequisites..."
3. Press "Send decline". "Request declined" appears.

⚠️ The reason **is sent to the student**. Write it as you would want it read.

**Expected errors:** "Student is already enrolled in this course" — a stale request; they got in another way.

**Who can do this:** the owner. (Not delegated to staff.)

📸 [Screenshot: the table plus the "Enrolment decision" panel with the approve button armed]

---

### 3.6 Page: Teachers (and collaboration requests)

**Purpose and when to use it:** manage who teaches at your center, and the agreements with them.

**How to get there:** "Teachers", or `/dashboard/admin/teachers`.

**What is on the page:**
1. "Invite Teacher" at the top.
2. **The "Collaboration requests" panel** directly beneath the heading — with "Apply to teach at a center" and "Invite a teacher", and columns "With", "Class", "Schedule", "Center share", "Status", "Actions". Requests are tagged "Incoming — your decision" or "Sent by you".
3. The teacher table: "Teacher", "Subjects", "Courses", "Rating", "Status", "Actions".

**Actions:** invite / re-invite / remove a teacher / send, accept, decline or cancel a collaboration request — detailed in 2.6.

⚠️ **"Remove" is destructive** and asks for confirmation. Do not use it as a temporary pause.

**Special cases:**
- "Pending Invite" = the account is not claimed yet.
- "Off-system" = a teacher with no account at all; do not wait for them to accept anything.
- "No teachers yet" ships with an invite button in the middle of the screen.

**Who can do this:** owner (invite/remove); manager (collaboration requests only).

📸 [Screenshot: the "Collaboration requests" panel with one incoming and one sent request]

---

### 3.7 Page: Classes

**Purpose and when to use it:** every group at the center — prices, schedule, hall and capacity.

**How to get there:** "Classes", or `/dashboard/admin/classes`.

**What is on the page:** a search box ("Search classes or teachers"), "Filters" (subject / status / teacher), a "Create Course" button, and a table with "Course", "Schedule", "Room", "Price", "Capacity", "Status", "Actions", plus the unpriced-class banner.

**Action 1 — create a class:**
1. Press "Create Course".
2. Fill in: "Title" (e.g. "Algebra Foundations"), "Subject", "Teacher", "Room (optional)", "Days of week" (at least one), "Start time" and "End time", "Term" (dates required), "Price (EGP)", "Max students", "Grade tag (optional)", "Description (optional)".
3. Press "Create". "Course created" appears.

**Action 2 — price it and set the settlement basis:** see 2.7.

**Action 3 — cancel a class:**
1. Open the class → "Cancel Course".
2. Read the warning: **"Cancelling this course will unenroll all students. This can't be undone."**
3. Enter a "Reason for cancellation".
4. Confirm, or press "Keep Active" to back out.

⚠️ Cancelling is irreversible and unenrols every registered student.

**Expected errors:**
- "No active teachers available. Add or activate a teacher first." — back to 2.6.
- "Not saved — review the highlighted fields".
- "Term dates are required".

**Who can do this:** 🔒 the owner only. Creating and pricing classes is **forbidden to every staff role**.

📸 [Screenshot: the "Edit Course" form with both prices and the "What is one lesson worth?" selector]

---

### 3.8 Page: Session schedule

**Purpose and when to use it:** see the whole week at once, catch clashes before they happen, **and close finished lessons**. Description: "A full week: every session in its hall, clashes marked."

**How to get there:** "Schedule", or `/dashboard/admin/schedule`.

**What is on the page:** "Previous week" / "This week" / "Next week", a session counter, a clash counter, and the week grid.

**Action 1 — review the week:**
1. Move between weeks with the three buttons.
2. Inspect anything tagged "Hall clash" or "Teacher clash", and fix it by editing the class from "Classes".
3. Cards read their state — "Cancelled", "Completed", "Postponed" — and a session with no hall reads "No hall".

**Action 2 — the most important action on this page: close a lesson and distribute its revenue:**
1. Press a session card. A dialog opens titled with the class name, containing **"Close the lesson and distribute it"**.
2. Review the figures before pressing anything: "Students present", "Lesson price per student", then "Each party's share, per student" split across "Platform", "Center" and "Teacher", and finally "Teacher's total".
3. Press **"Close the lesson and distribute EGP {amount} across {n} students"** — arming; the hint reads "The distribution is written to the ledger once, and cannot be undone."
4. Press **"Final confirmation — press to distribute"**; the second hint: "Written to the ledger in your name, and credited to the teacher's and the center's wallets immediately."
5. "Lesson closed and its revenue distributed" appears, and your share reaches the center wallet in the same instant.

⚠️ **Closing is final and never repeats.** A closed lesson is never re-priced, even if the class price changes afterwards.

**Reasons a lesson cannot be closed — all rendered as prose on screen, never as a mute disabled button:**

| Text shown | Meaning | What to do |
|---|---|---|
| "This class has no price, so the lesson would distribute nothing. Set the class pricing first." | Unpriced class | 🔒 Price it (2.7), then close |
| "No students are marked present, so there is nothing to distribute. Take attendance first." | No attendance | Take attendance at the counter |
| "This lesson was already closed and distributed on …" | Already closed | Nothing |
| "The lesson is cancelled, so there is nothing to distribute." | Cancelled | Nothing |
| "The hall's per-student fee exceeds this lesson's price — fix the class pricing first." | Inconsistent pricing | Review the hall rate or the class price |
| "This class is teacher-direct; its revenue is distributed at payment time, not when the lesson closes." | No center involved | Normal — no close needed |

> **This is the step most often forgotten.** A lesson taught and paid for but never closed means a teacher who was not credited and a center share that never reached the wallet. Make closing today's lessons a fixed daily item (Recipe 6).

**Who can do this:** the owner (viewing and closing). A teacher can close their own lesson from their screen at the end of attendance — **same panel, same figures, same entries**, so there are never two different money paths.

📸 [Screenshot: a week with a session tagged "Hall clash"]
📸 [Screenshot: the "Close the lesson and distribute it" dialog with its full figures before confirmation]

---

### 3.9 Page: Rooms

**Purpose and when to use it:** build and price the halls. Description: "Rooms and their prices drive what teachers see when they request a collaboration. Changing a price never touches existing classes."

**How to get there:** "Rooms", or `/dashboard/admin/rooms`.

**What is on the page:** a "Total Rooms" counter ("Every room is bookable by teachers"), "Add Room", and a table with "Name", "Capacity", "Price", "Features", "Photos", "Created", "Actions", plus "View details" per room.

**Actions:** create / edit / add and order photos ("Cover", "Move earlier", "Move later", "Remove") / delete — fully covered in 2.5.

**About deleting a hall — three facts worth knowing:**
1. **The delete is refused while the hall still has upcoming sessions.** The server rejects it outright if even one future session is "scheduled" or "postponed". Clear the hall's calendar first (move those sessions to another hall by editing the class, or cancel them).
2. **The hall is not erased from the database — it is deactivated.** So past sessions and their financial records keep their hall, and no historical report breaks.
3. ⚠️ **You still cannot undo it yourself** — there is no "restore hall" control on any screen, and the hall disappears from your list and from teachers' choices. The dialog's "This action can't be undone" is true from where you stand. To get it back, ask the platform team, or create a new hall.

**Who can do this:** the owner **and the manager**. ❌ Not the receptionist, not the accountant.

📸 [Screenshot: a room detail page with photos, price and pricing methods]

---

### 3.10 Page: Fees

**Purpose and when to use it:** all the center's money in one place — the payment log, recording a collection, recording a cash subscription, and the center wallet with its payout request.

**How to get there:** "Fees", or `/dashboard/admin/fees`.
The line at the top of the screen: "Every amount here is written into a ledger that cannot be edited. The only correction after recording is a new reversing entry."

**What is on the page:**
1. **Date filter** — "From date" / "To date" / "Reset".
2. **The net-profit panel** — "Total Revenue" − "Total Expenses" = "Net Profit".
3. **"Center wallet"** — "Wallet balance", "Reserved by open requests", "Available to withdraw", "Recent payout requests", and a "Withdraw earnings" button.
4. **"Payment Log"** — "Student", "Student code", "Course", "Amount", "Date", "Receipt #", "Recorded by", "Type" ("Receipt" in teal, or "Refund" in red with a negative figure), plus a **"Refund"** action column that appears on receipt rows only.
5. **"Paid vs Outstanding"** — a chart.

**Action 1 — record a cash subscription:**
1. Press "Record subscription (cash)".
2. Pick the "Student" and the "Class".
3. Pick the "Plan": "Monthly" or "Per-session".
4. For "Per-session", pick the "Session".
5. Leave or clear "Mark attendance for this session now (counter check-in)".
6. Read the note: "Cash is collected at the counter. The plan price configured on the course is charged — it activates immediately and writes the receipt + ledger entry."
7. Press "Confirm cash subscription". "Subscription recorded and active" appears with the receipt number.

**Action 2 — record a payment:** "Record Payment" → "Select a student" → "Select a class" → "Amount (EGP)" → "Record" → "Payment recorded".

**Action 3 — refund against a receipt (two steps):** 🔒
1. In "Payment Log", press **"Refund"** on the receipt's row. (The button never appears on a refund row — a refund is not refunded.)
2. The "Refund against a receipt" panel opens showing the student, the receipt number, and the "Original receipt" amount.
3. Adjust "Refund amount (EGP)" — it arrives pre-filled with the receipt's full value. The cap is printed underneath: "Maximum {amount} — this receipt's own value." Exceed it and the line turns red — "More than the receipt's value. You cannot refund more than was collected." — **and the commit button is disabled.**
4. Enter a **"Reason (required)"**; the button stays disabled without one.
5. Read the notice: **"A refund is a new ledger entry and is never deleted — the original receipt stays exactly as it is, with a negative entry recorded beneath it. It cannot be undone, and the student and their guardian are notified."**
6. Press "Refund {amount}" — arming.
7. Press "Final confirm — press to record the refund". "Refund recorded" appears.
8. **What happens:** a new row appears in the log with a red negative amount, a "Refund" badge and **its own receipt number**; the original receipt is untouched; and the reports and revenue figures recalculate immediately.

⚠️ A refund is itself irreversible — its only correction is a fresh collection. Read the amount twice before confirming.
> **A limit worth knowing:** the cap above is enforced by this panel, and the database holds no link between a refund and its receipt — so nothing stops two refunds against one receipt if the panel is opened twice. Check the log before refunding the same receipt again.

**Action 4 — request a payout (two steps):** 🔒
1. Press "Withdraw earnings".
2. Enter "Amount (EGP)", or leave it blank: "Leave empty to withdraw everything".
3. Review "Wallet balance", "Reserved by open requests" and "Requested".
4. Read: **"A payout request reserves the amount from the center's balance immediately and is written to the ledger. It cannot be undone — only the platform can cancel it."**
5. Press "Request {amount}" — arming.
6. Press "Final confirm — press to record the request". "Payout request submitted" appears.

⚠️ **The most important messages on the page — when the connection drops:**
- On a payout: "The connection dropped before a reply — the request may already be recorded. Check 'Recent payout requests' before retrying; do not press twice."
- On a collection: "The connection dropped before a reply — the amount may already be recorded. Check the payment log before re-entering it; do not collect again."
**In both cases: check first, never repeat.**

**Who can do this:** the owner. 🔒 **Payout requests and refunds are owner-only; no staff member can make either.** The center accountant sees the figures and the log **read-only** in their portal.

📸 [Screenshot: the "Center wallet" panel with all three figures, and the withdraw dialog armed]

---

### 3.11 Page: Expenses

**Purpose and when to use it:** record operating expenses so "Net Profit" means something. Description: "Expenses are deducted from the center's net profit in reports. Each entry is dated and counted once."

**How to get there:** "Expenses", or `/dashboard/admin/expenses`.

**What is on the page:** a "Record Expense" button and a table of "Date", "Category", "Description", "Amount".

**Categories:** Rent, Utilities, Salaries, Supplies, Marketing, Maintenance, Other.

**Actions:**
1. **Record:** "Record Expense" → "Amount (EGP)" → "Category" → "Date" → "Optional details" → "Record" → "Expense recorded".
2. **Edit:** "Edit Expense" → save → "Expense updated".
3. **Delete:** asks "Delete this expense?" → confirm → "Expense deleted".

**Expected errors:** "Amount is required" / "Amount must be greater than 0" / "Category is required" / "Date is required".

**Who can do this:** the owner. (The accountant reads expenses but cannot change them.)

📸 [Screenshot: the "Record Expense" form with the category list open]

---

### 3.12 Page: Reports

**Purpose and when to use it:** the monthly close, meetings, and any figure you need as a file. Description: "Every figure here is derived from the center's ledger and cannot be edited from this screen. Change the date range to recalculate."

**How to get there:** "Reports", or `/dashboard/admin/reports`.

**What is on the page:**
1. **Filters:** "Date range:", "Granularity:" ("Monthly" / "Weekly"), "Reset".
2. **Headline cards:** "Net Profit" with its "margin", and "Attendance Rate".
3. **Sections:** "Cashflow", "Expense Categories", "Revenue by Course", "Enrollment Rate" ("Fill Rate %"), "Enrollment Funnel", "Session Status".
4. **An "Export" menu** with two options: "Excel file (CSV)" and "Print / PDF".

**The six exportable reports:**

| Report | Who can export it |
|---|---|
| Profit and loss statement | Owner / accountant |
| Revenue by group | Owner / accountant |
| Expenses by category | Owner / accountant |
| Group fill rates | Owner / manager |
| Attendance by group | Owner / manager |
| Enrollment funnel | Owner / manager |

**Actions:**
1. **CSV export:** "Export" → "Excel file (CSV)" → pick the report → the file downloads and opens directly in Excel with Arabic names intact.
2. **Print/PDF:** "Export" → "Print / PDF" → a clean print page opens with no menus → use the browser's print command and choose "Save as PDF".

> **A deliberate design note:** the menu lists every report to everyone, and the server decides what you may have. So a manager asking for a financial report reads a refusal — correct behaviour, not a fault.

**Special cases:** "No cashflow data yet." and its siblings mean the range has no activity, or the center is new. Widen the range.

**Who can do this:** owner (everything), manager (operational), accountant (financial, read-only).

📸 [Screenshot: the "Export" menu open with all six reports]

---

### 3.13 Page: Staff

**Purpose and when to use it:** build the team, change roles, deactivate and reactivate.

**How to get there:** "Staff", or `/dashboard/admin/staff`.
The full description on screen: "Create staff accounts with preset roles. Staff act on behalf of your center — every action is logged, and no one can touch the wallet, pricing, settings, or other staff."

**What is on the page:** an "Add staff member" button, the staff list (each row: name, "Title", an "Invite pending" tag where relevant, a "Role" selector, and an activate/deactivate control), and a "Role permissions" panel beside it.

**Action 1 — add a staff member:** see 2.9.

**Action 2 — change someone's role:** pick the new role from the selector next to their name — it takes effect immediately. (The selector is disabled for a deactivated member.)

**Action 3 — deactivate:**
1. Press "Deactivate".
2. Read: "{name} will lose access on their next request. You can reactivate them later."
3. Confirm.

**Action 4 — reactivate:** "Activate" → "{name} will regain access with their assigned role."

**Action 5 — resend an invite:** "Resend invite" → "Send {name} a fresh invite link. The previous link stops working immediately."

**Recorded on the screen itself:** "Every staff action is recorded on behalf of your center" — each staff action is attributed to them personally in the audit log, noting that it was performed on the center's behalf.

**Who can do this:** 🔒 the owner only. Staff management is closed to every staff role, managers included.

📸 [Screenshot: a staff row with the three-role selector open]

---

### 3.14 Page: Team notes

**Purpose and when to use it:** an internal task board for the team (owner + staff). It is not a chat; it is a to-do list with states and read receipts.

**How to get there:** "Team Notes", or `/dashboard/admin/notes` (staff: `/dashboard/staff/notes`).

**What is on the page:** a composer, the note cards (pinned first), and under each note a "read by n of total" line with names.

**Actions:**
1. **Write a note:** type and post.
2. **Change its state:** any team member flips a note (open → done / declined, or reopen). Done and declined notes render struck through.
3. **Pin:** the author or a lead (owner/manager) pins a note to the top.
4. **Edit:** the author alone edits their own note text.
5. **Delete:** the author or a lead (a soft delete — the record is not erased).

**Important:** **opening the board counts as reading it.** So even the center accountant — who can post nothing — registers as having read.

**Who can do this:** everyone, including the accountant (read-only: no composer is shown to them).

📸 [Screenshot: the board with one pinned note and one marked done]

---

### 3.15 Page: Audit log

**Purpose and when to use it:** answering "who did this, when, and to what?" in any dispute or review.

**How to get there:** "Audit log", or `/dashboard/admin/audit`.
Description: "Every sensitive action taken inside your center — who did it, to what, and when."

**What is on the page:**
1. **A standing notice:** "This log cannot be edited or deleted — not from this screen and not from any other. It shows your center's actions only."
2. **Filters:** "User" (default "All users"), "Action type" (the screen's own example: `center.`), "From", "To", and "Clear filters".
3. **The entries** — actor (or "System"), action type, target, time ("Today" / "Yesterday" / a date), an "on behalf of" tag for staff actions, and "Before" / "After" values.
4. **Paging:** "Previous" and "Next", with a "{n} actions" counter.

**Actions:**
1. Filter by user and/or action type and/or date range.
2. Open an entry to read "Before" and "After".
3. "Clear filters" to return to everything.

**Who can do this:** the owner.

📸 [Screenshot: the log filtered to one user, showing an entry tagged "on behalf of"]

---

### 3.16 Page: Messages

**Purpose and when to use it:** talking to teachers and families inside the platform.

**How to get there:** "Messages", or `/dashboard/admin/messages`.

**What is on the page:** the conversation list, the thread, and a composer.

**Rules to know before using it:**
1. **Who you can reach is bounded by your actual relationship to them** — you cannot message someone you have no relationship with on the platform.
2. **A minor with no guardian email receives no messages from adults** — not from you and not from teachers. The fix: record the guardian's email (3.3).
3. **Staff:** receptionists and managers have an inbox. ❌ **The center accountant has no messaging at all**, and the product explains itself: "No messaging in this role — by design… An accountant reads the center's books, not its families."
4. **A minor's threads are visible to their parent**, read-only, and both sides see a standing notice saying so.

**Who can do this:** owner, receptionist, manager.

📸 [Screenshot: the messages screen with a thread open to a teacher]

---

### 3.17 Pages: Notifications and Settings

#### Notifications (`/dashboard/admin/notifications`)
- Everything that happened and concerns you, with an unread counter and "Mark all read".
- Types include: payment recorded, absence marked, session cancelled, session postponed, enrolment request approved or declined, attendance corrected, **guardian contact required**, and team notes.
- Press any notification to land on the screen it concerns.

#### Settings (`/dashboard/admin/settings`)
The cards on this page:
1. **"Profile"** — your own details: "Name", "Phone", "Language", plus your email, role and status. Then "Save changes".
2. **"Center logo"** — upload / replace / remove. (Available to the owner **and the manager**.)
2b. 🔒 **"Center details"** — the center itself, not you. The screen says so: "The center's own details, as teachers and students see them — not your personal profile above." Fields: "Center name", "Governorate", "Area" (its list is derived from the governorate, it is disabled until one is chosen, and changing the governorate clears the area so a district can never sit under the wrong governorate), "Phone", "WhatsApp", "Email", "Address". Then "Save center details" → "Center details saved".
   **Owner only** — a manager edits the logo but not this card.
3. **Push notifications** — enable or disable browser notifications.
4. **"Two-factor authentication (2FA)"** — strongly recommended on the owner account:
   1. Press "Enable two-factor authentication".
   2. Confirm your password.
   3. "Scan the QR code with an authenticator app (Google Authenticator, Authy…) then enter the 6-digit code to confirm."
   4. **Save the "Backup codes"** — "Each code can be used once if you lose access to your authenticator app." Use "Copy codes".
5. **"Password"** — ⚠️ "You will be signed out of every device — including this one — and sign in again with the new password." Requirement: "At least 8 characters, including a letter and a number."
6. **"Devices & sessions"** — "Every device currently signed in to your account. Sign out of anything you don't recognise", with "Sign out" and "Sign out of all other devices".

> **Covered educational stages** are the one thing this card does not edit — they stay in the wizard at `/en/onboarding?edit=1`.

📸 [Screenshot: the two-factor card mid-enrolment with the backup codes]

---

### 3.18 Page: Off-system teachers

**How to get there:** **"Off-system teachers"** in the sidebar, directly under "Teachers", or `/dashboard/admin/external-teachers`.

**Purpose and when to use it:** verbatim — "Teachers who work at the center without a platform account. The center keeps their students, attendance, grades and money by hand — and all of it appears in the center's reports alongside everyone else."

**What is on the page:** an "Add an off-system teacher" button, the teacher list (name, "Off-system" tag, "Owed", an "Open" button), and a "Gaps that need attention" panel with a "Review" button.

**Action 1 — add an off-system teacher:**
1. Press "Add an off-system teacher".
2. Read the note: "This teacher will have no account and no login. You will record their groups, students, attendance and payments."
3. Fill in: "Teacher name" (required), "Phone", "Email" ("Optional for now — required only if they decide to join the platform later."), "Subjects (comma separated)", "Center's share per lesson (EGP)" ("Hall rent or the center's flat cut of each lesson. Leave empty if it is not agreed yet.").
4. Save. "Teacher added" appears.

**Action 2 — register their students:**
1. Open the teacher → "Add a student".
2. Fill in "Student name", "National ID" ("14 digits. Used so the same child is never registered twice."), "Guardian phone", "Group".
3. Save.
4. **If the student is already known** you will read: "We already had this student — they were linked to the teacher instead of being duplicated." That is the correct outcome; do not create a second record.

**Action 3 — read the "Reconciliation statement":** it shows "Collected from students", "Center's share", "Platform commission" and "Owed".
Two warnings may appear:
- "{count} lesson(s) have happened but were never completed — the teacher is not credited for them until they are." ← **close those lessons first.**
- "{count} older lesson(s) have no per-lesson split record, so the share figures above exclude them. The 'Owed' balance does not."

**Action 4 — settle in cash with the teacher:**
1. Press "Settle".
2. Read: "This teacher is owed {amount}. Enter what you actually handed over."
3. Enter "Amount (EGP)" and a "Note".
4. Confirm "Confirm handing this amount to the teacher?". "Settlement recorded" appears.

⚠️ This is a permanent entry in a statement that cannot be edited. Record what you actually handed over, not what you intend to.

**Action 5 — the gap report:**
Press "Review" (or open `/dashboard/admin/external-teachers/gaps` directly). You will read a summary such as "3 things are missing and are holding up money or attendance." The possible gaps:

| Gap | Tag | Why it matters |
|---|---|---|
| "Past lesson never completed" | Blocking | The teacher is not credited until it is closed |
| "Lesson ran with no attendance" | Blocking | Nobody to charge |
| "Partial attendance" | Warning | Review the roster |
| "Enrolled student has not paid" | Warning | Outstanding collection |
| "Group has no schedule" | Warning | No sessions will be generated |
| "Group has no price" | Blocking | Nothing can be collected or distributed |
| "Group has no students" | Warning | An empty group |

And when the record is clean: "Nothing missing — Every lesson has attendance and is completed, and every enrolled student has paid."

**Action 6 — move the teacher onto the platform:**
1. Press "Move onto the platform".
2. Read the guarantee: "All of their records ({records} in total) stay exactly where they are, on the same account — nothing is lost. We will email them an invite to set their own password."
3. Enter the email (required for the invite) and a "Reason".
4. Confirm. You will see: "Converted and the invite was sent. If the email does not arrive, hand them this link:" — **copy the link.**

**Who can do this:** the owner.

📸 [Screenshot: an off-system teacher's reconciliation statement showing the uncompleted-lessons warning]

---

### 3.19 The staff portal (`/dashboard/staff`)

A separate portal whose menu changes with the staff member's role. It is built for standing, one-handed phone use: bigger targets, bigger type.

| Page | Receptionist | Manager | Accountant |
|---|:---:|:---:|:---:|
| Overview | ✅ | ✅ | ✅ |
| Counter | ✅ | ✅ | ❌ |
| Check-in | ✅ | ✅ | ❌ |
| Students | ✅ | ✅ | ❌ |
| Rooms | ❌ | ✅ | ❌ |
| Reports (operational) | ❌ | ✅ | ❌ |
| Finance | ❌ | ❌ | ✅ read-only |
| Messages | ✅ | ✅ | ❌ |
| Team Notes | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ |
| Settings | ✅ | ✅ | ✅ |

**The staff "Overview"** opens with the counter board itself, then "Shortcuts", then the team notes board — so a staff member lands and starts working without navigating.

**A note on the manager's screen:** the financial figures are stripped from their dashboard — they see operations, not revenue.

📸 [Screenshot: a receptionist's portal on a phone with the bottom bar]

---

## 4. The full money cycle (replacing "Subscription & billing")

> **This section replaces the usual "Managing your subscription and billing" chapter, because the platform charges the center no subscription.** What follows is the actual model as the public "How we charge" page (`/pricing`) states it and as the product implements it.

### 4.1 What you do not pay

Verbatim from the public page, under "What we don't charge":
- "No monthly platform subscription for a center or a teacher."
- "No activation or setup fee."
- "No fee for withdrawing your own wallet balance."
- "Nothing charged to the student on top of the lesson or subscription price."
- "No commission on a session nobody attended — the calculation starts at attendance."

**In practice:** there are no subscription invoices, no renewals, no upgrades, no downgrades, no cancellation, and no expiry. Your account never stops because you did not pay, because there is nothing to pay.

### 4.2 The three governing rules

1. **"What the student pays is the price"** — nothing is added on top. The platform's share is deducted from the lesson itself, after the money has come in.
2. **"Rates freeze when the class is created"** — a class records its rates at creation and keeps them. Later pricing changes apply to new classes only.
3. **"Every pound leaves an entry that cannot be edited"** — each settlement writes into a ledger closed against updates and deletes at the database level, and not even a super-admin account can alter an entry once written.

### 4.3 How money comes in — two routes, one ledger

| | Cash at the counter | Online |
|---|---|---|
| Who records it | Center staff | The student or parent |
| Instrument | Notes in your hand | Card or mobile wallet via Paymob |
| Result | Numbered receipt + ledger entry | Exactly the same entry |

The reference text: "Cash is written to the same ledger with the same entries as an online payment — there is no second money path… The payment method changes neither the calculation nor the distribution. All that changes is who recorded it."

### 4.4 When money is distributed — the crux

| Class type | Moment of settlement |
|---|---|
| Subscription with an **independent teacher** (no center) | **The moment payment succeeds** — online or cash |
| A lesson in **your hall** | **The moment the lesson is closed**, and only for students **actually present** |

⚠️ **A counter check-in alone is not attendance in two-stage mode.** The reference text: "A counter check-in without the second check-in at the hall door (in two-stage mode) does not count as attendance, and therefore does not settle." A student tagged "Passed the counter — door pending" is not yet present and does not enter the distribution.

### 4.5 How your share is computed — four cases

1. **Whole-room percentage** — your hall takes a published percentage of each lesson's price. The percentage is set by the platform; neither teacher nor center enters an amount.
2. **Per attending student** — the hall takes a flat amount (or a percentage of the lesson price) for every student who attends. **You set this figure for your hall**, under two conditions: it may not exceed the platform's published maximum, and it must be quoted in the same form the platform published (pounds or percentage). The teacher sees the number on the hall card **before** booking, not after settlement.
3. **A class with no hall pricing** — settles on the platform's flat per-attending-student fee, **with no center share**, because no agreed rate exists. That fee "never exceeds the lesson price itself".
4. **Teacher-direct class** — no center in the transaction, so no center share.

### 4.6 What is one lesson worth?

A class may carry two different prices (monthly and per-session), so you choose the settlement basis in "Edit Course":

| Option | Calculation | When to pick it |
|---|---|---|
| "Course price ÷ number of lessons" | Monthly price spread across lessons | The default; monthly-subscription groups |
| "Single-lesson price" | The per-session price as-is | Pay-per-session groups |
| "Each student's own subscription" | Each attendee settles at what they paid | A group mixing monthly subscribers with per-session payers |

⚠️ The change applies forward only: "it applies to future lessons only; lessons already settled never change."

### 4.7 The center wallet and withdrawals

- Your share of every closed lesson **lands in the center wallet immediately**, visible under "Fees" → "Center wallet".
- Three figures: "Wallet balance", "Reserved by open requests", and **"Available to withdraw"** — the last is what you can actually request.
- **A payout request reserves the amount immediately** so it cannot be requested twice; it is then reviewed and paid.
- "There is no minimum and no withdrawal fee."
- ⚠️ "It cannot be undone — only the platform can cancel it."

### 4.8 Correcting a mistake

**There is no undo button for any money entry.** What exists:

| Situation | The correct move |
|---|---|
| Collected a wrong amount | 🔒 Fees → "Payment Log" → **"Refund"** on that receipt (3.10, Action 3). It appears as a new entry beside the original |
| Collected twice by mistake | Refund the excess the same way. Do not try to delete the receipt — it cannot be deleted |
| Connection dropped and you don't know whether it saved | **Check the "Payment Log" first**; do not collect again |
| Closed a lesson at the wrong price | Nothing is re-priced retroactively. Fix the price for future lessons, and contact the platform if a correcting entry is genuinely needed |
| An expense recorded in error | Expenses (uniquely) can be edited and deleted from their own screen |

### 4.9 Receipts

Every collection issues a receipt number on your center's own sequence (format example: `RCP-NILE-2026-00002`). It appears in the "Payment Log" and in the student record, and is copyable.

**How to hand a receipt over:** press **"Download receipt"** on the payment's row — a clean receipt page opens outside the dashboard, with "Print / Save PDF" through the browser's own print command.
**There is no support for a thermal (POS) receipt printer in the product** — no setting, no integration. Any ordinary printer attached to the machine works from the print dialog; otherwise it is a link or a PDF.

---

## 5. Who does what

| Task | Owner | Manager | Receptionist | Accountant |
|---|:---:|:---:|:---:|:---:|
| Counter / door check-in | ✅ | ✅ | ✅ | ❌ |
| Walk-in registration | ✅ | ✅ | ✅ | ❌ |
| Collect cash and record a subscription | ✅ | ✅ | ✅ | ❌ |
| Cash top-up of a student wallet | ✅ | ✅ | ✅ | ❌ |
| Student lookup and records | ✅ | ✅ | ✅ | ❌ |
| Manage and price halls | ✅ | ✅ | ❌ | ❌ |
| Collaboration requests (send/accept/decline) | ✅ | ✅ | ❌ | ❌ |
| Operational reports (attendance / fill rate / funnel) | ✅ | ✅ | ❌ | ❌ |
| Financial reports and the money log | ✅ | ❌ | ❌ | ✅ read-only |
| Team notes board | ✅ | ✅ | ✅ | ✅ read |
| Messages | ✅ | ✅ | ✅ | ❌ |
| **Create and price classes** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Close a lesson and distribute revenue** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Request a wallet payout** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Refund against a receipt** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Manage staff and their roles** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Center settings** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Invite / remove a teacher** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Approve or decline enrolment requests** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Blacklist a student and lift it** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Off-system teachers and settling with them** | 🔒 ✅ | ❌ | ❌ | ❌ |
| **Audit log** | 🔒 ✅ | ❌ | ❌ | ❌ |

**The hard line, in the product's words:** "Never allowed for any staff: wallet withdrawals, pricing & revenue split, center settings, and managing staff — those stay with you."

**Two further rules worth stating:**
1. **The accountant cannot perform any write at all** — even where a screen is visible, any modification is refused. Their role is reading.
2. **A permission you do not have is absent, not greyed out** — a staff member does not stare at a dead button; the page simply is not there.

---

## 6. Task recipes (how-to)

### Daily

**Recipe 1 — start a counter shift (30 seconds)**
1. Open `/dashboard/staff` (or "Counter" from the owner portal).
2. Pick the teacher from "Teacher".
3. Press the lesson tagged "Running now".
4. Confirm the context line reads: teacher · time · group · hall.
5. Stay on "All students" while receiving, and watch the "Checked in" count.

**Recipe 2 — check in a student who has already paid**
1. Type the first letters of their name into "Student name, code or phone…".
2. Press "Check in" on their row.
3. Confirm "Checked in — present" and that they moved to the "Checked in" tab.

**Recipe 3 — collect cash and check in, one step**
1. Press "Collect {price} & check in" on the row tagged "Unpaid".
2. Press "Collect {price} in cash" (arming).
3. **Take the money.**
4. Press "Confirm — {price} received".
5. Confirm "Cash payment recorded" then "Checked in — present".
6. ⚠️ If you get "The cash was collected… but attendance was not marked" — **do not collect again**; press "Check in" only.

**Recipe 4 — register a walk-in standing in front of you**
1. From the counter press the walk-in button (or "Check-in" → "New walk-in student").
2. Enter "Full name" and "Phone".
3. **Ask for the guardian's email and record it** under "Guardian email". If there is none, record "Guardian phone".
4. Press "Create temp student".
5. If you see "No guardian email — hand the link over in person", copy the link shown and hand it over immediately.
6. Complete the collection and check-in with Recipe 3.

**Recipe 5 — a student not on this lesson's roster**
1. Type the name; you will get "No student by that name in this lesson".
2. Press **"Search"** — this searches every student by code or phone.
3. Use the action buttons on the "Not on this lesson's roster" results.
4. If nothing comes back at all, they are new → Recipe 4.

**Recipe 6 — close today's lessons (never end a day without this) 🔒**
1. Open "Schedule" and go to today.
2. Press the first finished lesson.
3. Review "Students present", "Lesson price per student", and the split.
4. Press "Close the lesson and distribute…" then "Final confirmation — press to distribute".
5. Repeat for every finished lesson.
6. Open "Fees" and confirm "Wallet balance" went up.

### Weekly

**Recipe 7 — import a student roster from Excel**
1. Export your roster as **CSV or TSV** (in Excel: Save As → CSV).
2. Make sure the file has a **header row** with a name column (e.g. "name"), plus optional phone, national ID, guardian name and guardian phone columns.
3. "Students" → "Import from file" → "Choose a file".
4. Press **"Preview"**. You will read "Preview — nothing has been saved yet" with counts: "New students" / "Already known" / "Duplicated in file" / "Rejected rows".
5. Read the row-by-row results; common errors: "Name is required", "National ID must be 14 digits".
6. Fix the file and preview again until you are satisfied.
7. Press **"Confirm import"**. "Imported {n} new students and linked {n}" appears.
8. Remember the two printed guarantees: "Importing only adds students to the center roster — no subscriptions, no payments, no group enrolment", and "A student we already know is linked to this center rather than created twice, and their details are left untouched."

**Recipe 8 — clear the enrolment queue 🔒**
1. "Enrollment Requests" → press a request → read the "Enrolment decision" panel.
2. To approve: "Approve enrolment" → "Final confirm — enrol the student".
3. To decline: "Decline with a reason" → write something fit for the student to read → "Send decline".
4. Watch the age-in-days column; do not let a request sit a week.

**Recipe 9 — add a teacher and get them running**
1. "Teachers" → "Invite Teacher" → email → send.
2. Wait for "Pending Invite" to clear (or press "Re-invite").
3. From "Collaboration requests" press "Invite a teacher" and fill in subject, grade, hall, days, times and start date.
4. On acceptance: open "Classes" immediately and price the new class (2.7).
5. Check "Schedule" for any "Hall clash" or "Teacher clash".

**Recipe 10 — move a student between groups**
> There is no single "transfer" button; a transfer is a two-part operation.
1. Open the student record from "Students" and check their current enrolments.
2. Enrol them in the new group (by approving an enrolment request, or by recording a cash subscription against the new group from "Fees").
3. End the old enrolment.
4. Check the "Payment Log" so nothing is double-collected.
5. ⚠️ **Never use "Blacklist Student" to transfer someone** — a blacklist is a disciplinary action that withdraws every active enrolment and is recorded in your name in the audit log.

> **Why it is two steps and there is no "Transfer" button:** the product has no transfer path at all — an enrolment is only created and removed. More importantly, **whatever is left of the student's subscription does not carry across**: coverage is tied to what was paid, so if they already paid on the old group, decide it explicitly — collect again, refund the difference (3.10, Action 3), or let the existing coverage run to its end. Write the decision on the team notes board so the counter is not left guessing later.

**Recipe 11 — clear off-system teacher gaps**
1. Open `/dashboard/admin/external-teachers/gaps` (direct URL).
2. Handle everything tagged **"Blocking"** first, especially "Past lesson never completed" and "Group has no price".
3. Re-check until you read "Nothing missing".

**Recipe 12 — settle with an off-system teacher 🔒**
1. Close all of their lessons first (otherwise you will see "{count} lesson(s) have happened but were never completed").
2. Open their record → "Reconciliation statement" → read "Owed".
3. Press "Settle" → enter **the amount actually handed over** and a "Note".
4. Confirm "Confirm handing this amount to the teacher?".

### Monthly

**Recipe 13 — the monthly close**
1. Confirm **every** lesson in the month is closed (Recipe 6).
2. Record every expense for the month under "Expenses".
3. Open "Reports", set the date range to the month, and "Granularity: Monthly".
4. Review "Net Profit", its "margin", and "Attendance Rate".
5. Export "Profit and loss statement" and "Expenses by category" as CSV.
6. Save a PDF copy via "Print / PDF".

**Recipe 14 — request a payout 🔒**
1. "Fees" → "Center wallet" → read "Available to withdraw".
2. "Withdraw earnings" → enter an amount, or leave it blank for everything.
3. "Request {amount}" → "Final confirm — press to record the request".
4. Track it under "Recent payout requests".
5. ⚠️ If the connection drops: check "Recent payout requests" **before** retrying.

**Recipe 15 — monthly account hygiene 🔒**
1. "Staff" → deactivate everyone who has left.
2. Review anyone stuck on "Invite pending" and either resend or deactivate.
3. "Settings" → "Devices & sessions" → sign out of anything unfamiliar.
4. Confirm two-factor authentication is on for your account.
5. "Audit log" → scan the month, especially entries tagged "on behalf of".

**Recipe 16 — review hall pricing 🔒**
1. "Rooms" → open each hall and review its price and "Allowed pricing methods".
2. Check "This hall's share per attending student" against the "Platform maximum".
3. ⚠️ Remember the change **touches no existing class** — new classes only.

---

## 7. FAQ and troubleshooting

**1. How much do I pay the platform each month?**
Nothing. No monthly subscription, no activation fee, no setup fee, no withdrawal commission. The platform takes a share of lesson revenue actually collected.

**2. I registered and cannot sign in.**
Read the message carefully. "Your account is still under review by the Edura team" is the normal state — wait for approval. "Your account is currently inactive" is something else entirely and means the account was disabled; contact support.

**3. I collected the wrong amount. How do I cancel it?**
You cannot. The only correction is a **refund** entry that appears beside the original receipt — the mistake stays visible and so does the correction, deliberately.
🔒 Fees → "Payment Log" → the **"Refund"** button on that receipt, then the amount, a reason, and two confirmations (3.10, Action 3). Owner only.

**4. The internet dropped mid-collection and I don't know if it saved.**
Read the message: "The connection dropped before a reply — the amount may already be recorded. Check the payment log before re-entering it; do not collect again." Open "Fees" → "Payment Log" and check. **Do not collect again.**

**5. I got "The cash was collected… but attendance was not marked".**
The money is in the ledger; only attendance failed. **Do not collect again** — press "Check in" only.

**6. The collect button says "No per-session price set".**
The class has no price. 🔒 Only the owner can set it, from "Classes" → "Edit Course" (2.7).

**7. I closed a lesson and the wallet balance didn't move.**
Possible reasons: (a) the class is teacher-direct, so there is no center share; (b) the hall has no pricing, so the platform's flat fee applies with no center share; (c) no students were marked present; (d) students checked in at the counter but not at the door in two-stage mode, so they do not count as present.

**8. A teacher says they were never paid.**
Almost always the lessons were never closed. Open "Schedule" and close every finished lesson (Recipe 6). For an off-system teacher the product tells you outright: "{count} lesson(s) have happened but were never completed — the teacher is not credited for them until they are."

**9. My receptionist can't find the Rooms/Reports page.**
That is the design. Permissions follow the role: halls and operational reports belong to the manager. Change their role from "Staff" if that is what you intend.

**10. The accountant says they can't do anything.**
Correct and intended: "Read-only view of this center's financial reports and ledger. No changes." They also have no inbox, and the product explains that itself.

**11. I created a staff account and don't know their password.**
You never will, by design: "The staff member sets their own password from an emailed invite link — you never see it." If the email did not arrive, press "Resend invite" (which kills the previous link immediately).

**12. A student can't message their teacher.**
Almost certainly a minor with no guardian email on file. Record the guardian's email and messaging opens. Note that classes, payments and attendance are entirely unaffected by this restriction.

**13. A student is registered at another center — should I create a new account?**
No. You will read: "Already in the system at {center} — they can keep it or switch after this session (they'll get a prompt)." Use the existing account.

**14. I want to change the center's name or address.**
Settings → the "Center details" card. Edit the name, governorate, area, phone, WhatsApp, email and address, then "Save center details". (Covered stages alone are still edited from `/en/onboarding?edit=1`.)

**15. Where is the off-system teachers page?**
In the sidebar: **"Off-system teachers"**, directly under "Teachers".

**16. I deleted a hall by mistake.**
You have no restore control, but the damage is smaller than it looks: **the delete is refused outright while the hall still has a single upcoming session**, and the hall is deactivated rather than erased — so past sessions and their reports keep their hall. Create a new one (existing classes keep the pricing frozen onto them at creation), or ask the platform team to reactivate the old one.

**17. A chart is empty and says "No data".**
The date range has no activity, or the center is new. Widen "Date range" or press "Reset".

**18. If the center account is deactivated, what happens to my data, students and teachers?**
**Nothing is deleted.** Deactivation closes sign-in immediately — your open sessions are revoked in the same instant, so no device keeps working afterwards — while the student roster, teacher affiliations, enrolments and the financial ledger all stay exactly as they are, and the action is reversible by reactivating. Withdrawing students from their enrolments is an entirely separate operation with its own reversal journal, and it does not happen just because an account was deactivated.

---

## 8. Glossary

| Term | What it means here |
|---|---|
| **Class / group** | A course for a subject, grade and teacher, with a schedule, a hall and a price. |
| **Session / lesson** | One meeting of a class, with a date and time, carrying attendance, whose money is distributed when it is closed. |
| **Closing a lesson** | The action that distributes a lesson's revenue across platform, center and teacher. Without it, nobody is paid. |
| **Collaboration request** | An agreement between a center and a teacher; accepting it creates the class and its whole schedule in one step. |
| **Counter board** | The screen that starts from a lesson and shows its roster. |
| **Counter check-in** | Attendance recorded at the front desk. |
| **Door check-in** | The second confirmation at the hall door, in two-stage mode. |
| **"Passed the counter — door pending"** | Checked in at the desk but not confirmed at the door — **not present, and not included in distribution**. |
| **Student code** | Eight characters (e.g. `G7K3M2QF`) on the student card, alongside a QR square. |
| **Shell** | An account created but not yet claimed with a password. |
| **Pending Invite** | An invite sent but not yet opened. |
| **Center wallet** | Your accumulated share from closed lessons. |
| **Available to withdraw** | Wallet balance minus amounts reserved by open payout requests. |
| **Payout request** | A withdrawal request; it reserves the amount immediately and only the platform can cancel it. |
| **Refund** | A reversing entry that corrects an earlier payment without deleting it. |
| **The ledger** | The record of entries, closed against edits and deletes. |
| **Audit log** | The record of sensitive actions: who, when, to what. |
| **"on behalf of"** | The tag showing a staff member performed an action in the center's name. |
| **Off-system teacher** | A teacher working at your center with no platform account, whose data you enter by hand. |
| **Reconciliation statement** | An off-system teacher's account: collected, center's share, platform commission, and owed. |
| **Settlement basis** | The rule deciding what one lesson is worth at distribution (course price ÷ lessons / per-session price / each student's own subscription). |
| **National ID** | 14 digits, used to prevent duplicating a student on import and manual entry. |
| **Operational parent** | The contact details recorded for a student at the center. |
| **Guardian email** | The address that enables a minor's messaging with adults, and where account links are sent. |

---

## 9. Operating checklists

**Daily**
- [ ] Open "Overview" and read the open-decision count.
- [ ] Run the counter on the live lesson.
- [ ] Collect from unpaid students as they arrive, checking each confirmation message.
- [ ] **Close every lesson that finished today.**
- [ ] Confirm nobody is left "awaiting door check-in" in two-stage mode.

**Weekly**
- [ ] Clear every pending enrolment request.
- [ ] Work the "Students behind on fees" list.
- [ ] Scan "Schedule" for clashes.
- [ ] Check off-system teacher gaps (if you have any).
- [ ] Confirm no class carries "No subscription price".
- [ ] Review the team notes board and close what is done.

**Monthly**
- [ ] Record every expense.
- [ ] Export the month's reports (CSV + PDF).
- [ ] Review net profit, margin and attendance rate.
- [ ] Request a payout.
- [ ] Review staff accounts, devices and sessions.
- [ ] Scan the audit log.

---

## 10. Consolidated ⚠️ list for the team

### (a) Team questions — five answered from the code, two still open

**Answered, and folded into the body of the manual:**

1. ✅ **The review decision:** approval activates the account and notifies the owner; rejection **requires a reason**, quoted verbatim in the notification — and the requirement lives on the **server**, not the screen (`min(1).max(500)`). (§2.2)
2. ✅ **Commission:** a global platform figure, with an optional figure per center or per teacher; precedence teacher → center → global. The code defaults are 15% on an independent-teacher subscription and 2 EGP per attending student on each side, and the figure actually in force is read live on `/pricing`. (§2.4)
3. ✅ **Receipts:** "Download receipt" → a clean print page → "Print / Save PDF". **There is no thermal/POS printer support anywhere in the product** (no setting, no integration — confirmed by searching the whole repository). (§4.9)
4. ✅ **Moving a student:** no transfer path exists — an enrolment is only created and removed — **and the remaining subscription does not carry across**, so the money decision is manual and explicit. (Recipe 10)
5. ✅ **Deleting a hall:** refused while it still holds a "scheduled" or "postponed" future session, and then it is a **deactivation, not an erasure** — past sessions keep their hall, but the center has no restore control. (§3.9)
6. ✅ **Deactivating a center account:** sign-in closes immediately (sessions are revoked in the same instant), and **the roster, affiliations and enrolments all stay exactly as they are — nothing is deleted** — with reactivation as the reverse. Withdrawing students from enrolments is a wholly separate operation with its own reversal journal.

**Still open — business decisions, not readable from the code:**

1. ⚠️ **The expected review turnaround** for a new center account, so we can print it instead of "wait for the notification". (§2.2)
2. ⚠️ **The sales channel:** the pricing page offers "Contact us" to model a center's real numbers, and no channel is documented inside the product (no number, no address, no dedicated form).

### (b) Product findings surfaced while writing this manual — **all now fixed**

1. ✅ **The "Off-system teachers" page was undiscoverable** — fully built and working, with no sidebar entry and nothing linking to it. **It is now in the sidebar**, directly under "Teachers" (and in the phone bar).
2. ✅ **There was no screen for editing the center's own details after setup** — name, governorate, area and phone were written once in the wizard and then had no entry point. **A "Center details" card now sits in Settings** (owner only), and the save route was widened to accept governorate and area too. Covered stages stay in the wizard.
3. ✅ **Refunds had no interface** — the server supported them completely (a payment's amount is SIGNED by design: positive = collection, negative = refund, and the money engine writes the reversing entry and notifies the family), but the client refused any amount ≤ 0, so no button existed. **A "Refund" action now sits on every receipt** in the payment log, capped at that receipt's value, with a required reason and a two-step commit.
   > **A limit left standing, deliberately:** no database column links a refund to its receipt, so the cap is enforced by the panel and nothing prevents two refunds against one receipt. Making that a database invariant is a migration, and a migration needs its own approved plan.
4. ✅ **A refund-rendering defect, found while building the above:** the payment log read a row's direction from a `type` field that **does not exist** on the payments table (the direction lives in the sign of the amount), so every refund rendered with a teal "Receipt" badge around a negative figure. Direction is now read from the amount itself. Likewise a row with no class read "unknown course" — a description of a failed lookup rather than a legitimately empty column — and now reads "—".

### (c) Irreversible actions — put these in every new hire's training

| Action | Who | Consequence |
|---|---|---|
| Confirming a cash collection | Counter | A permanent entry + a numbered receipt; correction only via refund |
| **Confirming a refund against a receipt** | 🔒 Owner | A permanent negative entry with its own receipt number; never cancelled, and the student and guardian are notified |
| **Closing a lesson and distributing revenue** | 🔒 Owner / teacher | A final distribution in the ledger; never repeated, never re-priced |
| Requesting a wallet payout | 🔒 Owner | The amount is reserved immediately; only the platform can cancel |
| Blacklisting a student | 🔒 Owner | Immediate withdrawal from every active enrolment (reversible by lifting it) |
| Cancelling a class | 🔒 Owner | Unenrols **every** student — no undo |
| Deleting a hall | 🔒 Owner / manager | No undo |
| Removing a teacher | 🔒 Owner | Ends their affiliation with the center |
| Cash settlement with an off-system teacher | 🔒 Owner | A permanent entry in a statement that cannot be edited |
| Resending an invite | 🔒 Owner | Kills the previous link immediately |
| Changing your password | Everyone | Signs you out of every device, including the current one |

