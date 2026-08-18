# Parent Guide — Edura

> **Status:** first publishable draft · written 2026-08-09 · every fact below is taken from the shipped code in `apps/www`, not from designs or plans.
> **Arabic version (primary):** [parent-guide.md](parent-guide.md)
> **For the team:** anything needing a decision or confirmation is marked ⚠️ inline and collected in [section 7](#7-open-items-for-the-team-).

---

## 1. Welcome

This platform is your daily window onto your child's schooling.

From wherever you are, at any time, you can see: did my child attend today's lesson? What did they score on the last test? What has been paid and what is still due? And who are they talking to on the platform? You can also pay for a single lesson or a monthly subscription straight from your card, and message their teacher or the centre without a middleman.

You need no technical experience. Everything works on your phone exactly as it does on a computer. And **you never pay a subscription to the platform itself** — your account is free; anything you pay goes to your child's lesson at their teacher or centre.

**What you can and cannot do:**

| ✅ You can | ❌ You cannot |
|---|---|
| Follow attendance, grades and payments | Edit a grade or an attendance record |
| Pay for your child by card or from your wallet | Use your child's wallet or balance |
| Message the teacher, assistant and centre | Message anyone outside your children's circle |
| **Read** your minor child's chats with adults | Reply or write in those chats |
| Unlink yourself from a child at any time | Link a student who already has a parent |

---

## 2. First-time journey — step by step

### 2-1. Creating your account

**Before you start, have ready:** an email address you actually use, your Egyptian phone number, and **your child's family code** if they have sent it (see step 2-3).

1. Open the platform at: ⚠️ [needs confirmation from the team: final platform address — `app.edura.eg` is configured but the domain is not live yet].
2. Tap **"Create account"** below the sign-in form.
3. Among the four role rows at the top of the form, tap **"Parent"**. The row highlights to confirm.
4. Enter your **full name**.
5. Enter your **email address**. It is your sign-in name and cannot already belong to another account.
6. Enter your **phone number** (optional). If you enter one it must be a valid Egyptian number, otherwise you will see "Invalid phone number".
7. Enter a **password**. Three rules, each with its own message if missed: at least 8 characters · at least one letter · at least one digit.
8. Re-enter it under **"Confirm password"**. A mismatch shows "Passwords do not match".
9. Press the create button.

**What happens next:** your account is activated **immediately, with no approval step** (unlike teacher and centre accounts, which are reviewed). You are signed in automatically and taken to your home page.

**If you see an error:**

| Message | What it means | What to do |
|---|---|---|
| "Email or phone already in use" | You already have an account | Go to sign-in, or use "Forgot password" |
| "Invalid phone number" | Not an Egyptian format | Enter it as `01xxxxxxxxx` |
| A message under one field | That field alone is wrong | Fix it and resubmit |

📸 [Screenshot: the sign-up form with the "Parent" row selected and the six fields empty]

### 2-2. Activating or confirming your account

**There is no activation step.** Your account works from the first moment; you will not receive an "activate your account" email and you are not asked to verify your address before using the platform.
⚠️ [needs confirmation from the team: email verification is not enforced in the code — does it stay that way at launch?]

### 2-3. Linking your first child — the most important section

After sign-up your account is **empty**: it holds no child data yet. Linking is the step that opens everything.

There are two routes, and the difference matters:

| | **Route 1: family code** | **Route 2: child's email or phone** |
|---|---|---|
| What you need | A code from your child | Their email or number |
| Result | **Instant link** — data opens at once | **Pending request** awaiting your child's approval |
| When to use | Your child is with you or can send it | Your child is not available now |

#### Route 1 — family code (instant)

**Where does the code come from?** From your child only. They open their account → the **"Family code"** page → copy the code and send it to you. The code belongs to them, and they can press **"Rotate code"** at any time, which issues a new one and kills the old.

1. In the side menu, tap **"Children"**.
2. In the **"Link a child"** box at the top, stay on the **"By family code"** tab (open by default).
3. Type the code. The field shows it uppercase, wide-spaced and left-to-right even on an Arabic page — that is deliberate; a code is not a word.
4. Press **"Link instantly"**.
5. A green message appears: **"Linked successfully."** Your child's name appears in the Children table with status **Approved**.

**Every possible outcome:**

| Outcome | Message | Cause | Fix |
|---|---|---|---|
| Success | "Linked successfully." | Code is valid | Nothing — move on to the other pages |
| Wrong or old code | "Invalid or expired family code" | Typo, or your child rotated the code after sending it | Ask for the current code and retry |
| Child has another parent | "Student already has an active parent link" | A student has **exactly one** parent | The current parent must unlink first, from their own Children page |
| Empty field | "Please enter the family code." | Nothing typed | Type the code |

📸 [Screenshot: the "By family code" tab with a code entered and the "Link instantly" button beside it]

#### Route 2 — child's email or phone (awaits their approval)

1. On **"Children"**, tap the **"By email or phone"** tab.
2. Enter your child's **email address** exactly as registered in their account.
3. Press **"Send request"**.
4. A message appears: **"Link request sent."** and the row shows as **Pending**.
5. **Your child receives an in-app notification and an email** telling them someone wants to link. You see none of their data until they approve.
6. Once approved the status turns **Approved** and every page opens. If they decline, it becomes **Rejected**.

**Every possible outcome:**

| Message | Cause | Fix |
|---|---|---|
| "Student not found" | No student account with that email/number | Check the address in their account, character by character |
| "A pending link already exists" | You already sent this request | Wait for their answer — do not resend |
| "Student already has an active parent link" | They already have an approved parent | The current parent unlinks first |
| "Invalid email address" | Malformed address | Check the `@` and the domain |

> **Note:** the field is labelled "student's email or phone", but the current screen **accepts email only**.
> ⚠️ [needs confirmation from the team: the server accepts a phone number, but the form validates for an email — add a phone field, or fix the label?]

📸 [Screenshot: the Children table with one Pending row and one Approved row]

#### A third case: your child starts the request

Your child can start the link from their side using your email. You then receive an **in-app notification and an email**, and the Children table shows a Pending row whose "Initiated by" column reads **Student**, with two controls:

1. Press **"Approve"** (the prominent button) → "Link approved" appears and the data opens at once.
2. Or press **"Reject"** (the small text link beside it — deliberately not a matching button, so it cannot be hit by accident) → "Link rejected" appears.

### 2-4. Adding a second child and switching between them

Add the second child with **exactly the same steps** from the Children page (their own family code, or their own email).

Once you have **more than one approved child**, a **child switcher bar** appears automatically at the top of: Home, Progress, Attendance, Fees and Pay for a lesson. Each child is a name with a small square holding their first initial; the highlighted one is the child currently displayed.

- Tap the other name → **every number on the page changes to that child immediately**.
- **The bar never appears when you have only one child** — deliberately, so the screen carries no choice that means nothing.
- **The choice is not remembered:** close the browser and return, and the page starts on the **first** child in the list.
  ⚠️ [needs a decision from the team: should the last selected child persist between sessions?]

📸 [Screenshot: the child switcher with two names, one highlighted]

### 2-5. Turning on notifications

1. Open **"Settings"** from the side menu.
2. Scroll to the **"Phone notifications"** box.
3. Press **"Enable"**. Your browser will ask its own question at the top of the screen: press **"Allow"**.
4. A confirmation appears and the button becomes **"Disable"**, so you can turn it off any time.

**If you pressed "Block" by mistake,** the button becomes unclickable and a line explains that the browser is refusing. Fix it in the browser, not in the platform (padlock icon next to the address → Notifications → Allow).

**If the box does not appear at all,** your browser does not support this. Notifications will still reach you **inside the platform**, on the Notifications page.

### 2-6. Reading your first report

1. Tap **"Home"**.
2. Look at the top row: four figures — **attendance rate**, **average grade**, **fees paid**, **fees due**. Under each one, a small line tells you what the number is **out of** ("of 24 recorded sessions") — that line is what makes the figure meaningful.
3. Scroll a little: two lists — **latest grades** (last 3) and **latest payments** (last 3).
4. Scroll further: three charts — paid coverage, attendance trend, grade trend.

If the boxes say "No grades yet" or "No payments yet", **nothing is broken** — the teacher simply has not entered anything.

---

## 3. Page-by-page tour

**Quick map:**

| Menu item | Answers |
|---|---|
| Home | How is my child doing overall? |
| Progress | How are they doing per subject? |
| Attendance | Did they attend? How often absent? |
| Children | Who is linked to my account? |
| Fees | What did we pay, and where is the receipt? |
| Pay for a lesson | How do I activate a lesson now? |
| My wallet | What is my balance, and where did it go? |
| Messages | How do I reach the teacher? |
| Child safety | Who is my child talking to? |
| Notifications | What is new? |
| Settings | My details, password and devices |

---

### Page: Home

**What this page tells you about your child:** the whole picture at a glance — attendance rate, average grade, paid vs due, and what just happened.

**How to get there:** first item in the side menu; first icon in the phone's bottom bar. It also opens automatically after sign-in.

**Sections:**

1. **Title and child switcher** (the switcher appears only with more than one child).
2. **Four figures:**
   - **Attendance rate** — a percentage, with "of N recorded sessions" beneath it.
   - **Average grade** — a percentage, with "across N subjects". It averages the *subject* percentages rather than pooling every mark, so a subject that happens to run more assessments does not dominate the figure.
   - **Fees paid** — in teal, which in this platform means **money confirmed**.
   - **Fees due** — in amber, which means **waiting**. **It is not red and not an alarm** — an outstanding balance is unpaid, not a fault.
3. **Latest grades** — last three: assessment name, subject, percentage.
4. **Latest payments** — last three: course, date, amount.
5. **Three charts** — a paid-coverage arc, an attendance line (last 14 days) and a grade line (last 12 grades). On the attendance line: 100% = present, 60% = late, 0% = absent.

**Actions:** none — nothing on this page changes anything. The only control is switching child.

**Special cases:**
- No linked child → **"No children registered."** Go to Children and link one.
- Loading → grey placeholder lines instead of the numbers; wait a moment.
- All zeros → the teacher has not recorded attendance or grades yet.

📸 [Screenshot: the full Home page with the four figures and three charts]

---

### Page: Progress

**What this page tells you about your child:** performance **subject by subject** — where they are strong and where to pay attention.

**How to get there:** "Progress" in the side menu.

**Sections:**

1. **Three figures:** overall percentage (with the grade band and subject count), best subject, attendance rate.
2. **Subject breakdown table:** Subject · Entries (number of recorded assessments) · Overall (progress bar + percentage) · Grade band.
3. **A bar chart** comparing subject averages.

**How to read it:**
- A subject's percentage is **the sum of your child's marks ÷ the sum of the maximums** for that subject, so a 50-mark exam outweighs a 10-mark quiz — as it should.
- The **grade band** is a word (Excellent / Very good / …) taken from one shared scale used across the whole platform, so it never differs between screens.
- Grades are rendered in plain ink with **no colour, deliberately**: colour in this platform carries fixed meaning about money and status, and is never spent on judging a child.

**Actions:** none — read-only, plus switching child.

**Special cases:** "No grade data available." → nothing recorded yet · "No subject comparison data yet." → only one subject, or not enough data.

📸 [Screenshot: the subject breakdown table with progress bars and the comparison chart below]

---

### Page: Attendance

**What this page tells you about your child:** did they attend, how often were they absent, and is the absence clustering on a particular day?

**How to get there:** "Attendance" in the menu — and the **second item in the phone's bottom bar**, because it is the most-asked daily question.

**Sections:**

1. **Four figures:** present · absent · late · total. Each carries an "of N" line, because "4 absences" means nothing without a denominator.
2. **A heat calendar** of the last 28 recorded days; each square is a day, coloured by status.
3. **Colour key:** 🟢 teal = present · 🟡 amber = late · 🔴 red = absent. When a day holds more than one status, the **worst** is shown (absent beats late, late beats present) so an absence can never hide behind a presence in another lesson.

**Actions:** none — **a parent never edits attendance**. Corrections come from the teacher or the centre, and you receive an "attendance corrected" notification when one happens.

**Special cases:** no records yet → an empty state with a calendar icon, usually because the subscription has not started or lessons are not recorded yet.

📸 [Screenshot: the four attendance figures, the heat calendar and the colour key]

---

### Page: Children

**What this page tells you about your child:** who is linked to your account, the state of each link, and who started it. It is **the one page where you hold real write authority**.

**How to get there:** "Children" in the menu.

**Sections:**

1. **"Link a child"** box with two tabs — "By family code" and "By email or phone" (steps in [2-3](#2-3-linking-your-first-child--the-most-important-section)).
2. **Children table:** Student · Status · Initiated by · Date · Actions.

**What each status means:**

| Status | Colour | Meaning |
|---|---|---|
| Pending | Amber | Sent, not yet answered |
| Approved | Teal | Active — data is open to you |
| Rejected | Red | The other party declined |
| Revoked | Grey | Was approved, then ended by one of the two |

**Actions:**

**a) Approve a request from your child** (shown only on a Pending row started by the student):
1. Press **"Approve"**.
2. "Link approved" appears and the row turns Approved.

**b) Reject:** press the small **"Reject"** text beside it. (It is deliberately not a matching button: rejection is the branch that is hard to undo, so it must never be the easy mis-click.)

**c) Open your child's ID card:** on an Approved row, press the card link → the [ID card page](#page-childs-id-card).

**d) Unlink:**
1. Press **"Unlink"** on an Approved row.
2. A confirmation appears: "The parent will no longer be able to access this student's data."
3. Press **"Unlink"** inside the dialog to confirm, or **"Cancel"**.
4. "Link revoked" appears, the status becomes Revoked — **and every piece of that child's data closes to you immediately**.

> **Important:** unlinking **does not delete** anything; it is recorded. To link again you start over with a family code or a new request.

**Special cases:** no links yet → "No linked children yet." · a failed action → a red message with a plain reason ("Failed to link", "Approval failed"…), and the page is unchanged, so retry.

📸 [Screenshot: the Children page with the link box above and a table holding an Approved and a Pending row]

---

### Page: Child's ID card

**What this page tells you about your child:** their official platform card — name, **8-character student code**, education system, grade, track, and a QR square that the centre's front desk scans.

**How to get there:** Children → on your child's Approved row, press the ID-card link.

**Sections:** the card at official-ID size, carrying your child's name, their student code, their study details, and a fine engraved rosette that is **different for every student** — a mark of authenticity, not decoration. **The card carries no phone, no email, no date of birth, no national ID and no money figure**, deliberately: a card can fall out of a child's bag.

**Actions:**
1. **"Save image" / "Share image"** — turns the card into an image. On a phone this opens the share sheet directly (to send it on WhatsApp, for instance).
2. **"Print"** — opens a clean print page with no menus; print it or save it as PDF from your browser.

**Special cases:**
- **"Your child's profile is incomplete"** → the card is not issued until their basic details are complete (system, grade, track, guardian contact). **This blocks neither attendance nor payment** — their code still works at the centre; only the printed card is withheld. The missing items are completed **by your child from their own account**.
- **"Old card" / revoked card** → a newer card has been issued, or the old one was stopped (a lost card, for example). Print the card shown now and destroy the old one.

📸 [Screenshot: the full ID card with "Save image" and "Print" beneath it]

---

### Page: Fees

**What this page tells you about your child:** every pound paid for them, when, against which receipt, and how much was refunded if any.

**How to get there:** "Fees" in the menu — and the **third item in the phone's bottom bar**.

**Sections:**

1. **A "Paying" box** at the top with a line about who pays.
   ⚠️ **[needs fixing by the team: this line currently reads "Payment is made from the student's account. A parent cannot pay directly yet." That text is stale — a parent **can** pay, from the "Pay for a lesson" page. The copy contradicts the product.]**
2. **A date-range filter** (from / to) with a "Reset" button.
3. **Three figures:** total paid · refunds · net paid (paid minus refunds).
4. **A chart** of cumulative payments over time (two lines: total and net).
5. **The payments table:** Course · Date · Receipt number · Status · Amount.
6. **A total line** below the table, separated by a double rule — an accounting convention meaning "this is the closing figure".

**Actions:**
1. **Filter by period:** pick both dates → the table *and* the figures narrow together. "Reset" returns to everything.
2. **Open a receipt:** in the Receipt column, press the link under the number → the receipt opens on its own page, ready to print or save as PDF.

**Special cases:**
- "No payments recorded." → nothing recorded for this child yet.
- "No payments in this period." → payments exist but fall outside the chosen dates — widen the range or press Reset.
- A row with a **negative** amount and status "Refund" → money returned to you; this is correct, not an error.
- Cash paid at the centre appears here too — you do not have to pay online for it to be recorded.

📸 [Screenshot: the fees table with the receipt column and the double-ruled total beneath]

---

### Page: Pay for a lesson

**What this page tells you about your child:** which lessons are available to them, what each plan costs, and how to activate one right now.

**How to get there:** "Pay for a lesson" in the menu, or from the phone's bottom bar.

**Sections:**

1. **The child switcher** — **check it before paying anything**: the payment is recorded against the selected child.
2. **Two tabs:**
   - **"Child's subjects"** (default) — only the subjects of your child's grade and track, which is what you usually want.
   - **"All subjects"** — the whole catalogue, with a **search box**.
3. **Subject list** — each subject is an expandable row; open it to see its lessons.
4. **Each lesson shows:** title · teacher · weekdays and times · centre (or "No centre" for an independent teacher) · the payment buttons.

**Actions:**

**a) Pay monthly:**
1. Confirm your child's name is the highlighted one at the top.
2. Open the subject → find the lesson.
3. Press **"Pay monthly"**, which carries the price on it.
4. A **"Confirm payment"** dialog opens showing the lesson, the plan, **your child's name**, and the amount.
5. Choose how to pay (step c).

**b) Pay for a single lesson:**
1. From the **"Pick a lesson"** dropdown beside the button, choose the date and time.
2. Press **"Pay for this lesson"**.
   - Pressing it before choosing shows: **"Pick a lesson first"**.
3. The same confirmation dialog opens.

**c) Choosing how to pay (inside the dialog):**
- **"Pay by card"** → you are taken to the secure payment page.
  ⚠️ **[needs confirmation from the team: the gateway currently runs in mock mode because the Paymob keys are not configured, so a "Test mode: simulate payment…" dialog appears instead of the real card page. This paragraph gets its final wording once the gateway is live.]**
- **"Pay from my wallet"**, with your balance shown → deducted immediately, with the message **"Paid from your wallet. [child]'s lesson is now active."**
  - If your balance is short, the button is unclickable and you see: **"Your wallet balance is not enough — top it up or pay by card."**

**Special cases:**
- "Not available for online payment" instead of buttons → the teacher has set no prices for that lesson. Contact them or pay cash at the centre.
- "No subjects in this child's track yet" → your child has not finished choosing grade/track. Try the "All subjects" tab.
- "No children linked to your account yet" → link a child first.
- **"We could not load your children. Refresh and try again."** → a temporary connection problem. **This message is deliberately different from "you have no children"** — the first means "we could not read", the second means "there are none". Do not be alarmed by the first.
- "Payment declined" → nothing was charged and nothing activated. Try another card, or the wallet.

📸 [Screenshot: the "Confirm payment" dialog showing lesson, child name, amount, and the card/wallet buttons]

---

### Page: My wallet

**What this page tells you about your child:** how much you have spent per child and when — the table has a column naming the child each spend was for.

**How to get there:** "My wallet" in the menu.

> **This wallet is yours alone.** It is not your child's wallet and is not connected to it. Your child has their own separate wallet, and **you can neither spend from it nor see its balance** — a deliberate decision: paying *for* your child is one thing; spending their money is another.

**Sections:**
1. **The balance card** at the top.
2. **"Top up"** button beside the title.
3. **Wallet history table:** Date · Type (top-up / payment / refund / adjustment) · **Child** (empty "—" for top-ups, which are not for a specific child) · Amount (green + or red −) · Balance after.

**Action — topping up:**
1. Press **"Top up"**.
2. Enter the amount in EGP.
3. Press **"Continue"** → the secure payment page (⚠️ mock mode currently, as above).
4. On success you see **"Your wallet has been topped up"**, and the balance and history update immediately.

- **Card only** — there is no cash top-up for a parent wallet.
- An invalid amount shows "Enter a valid amount".

**Special cases:** "No wallet activity yet" → you have not topped up · "Top-up declined" → nothing was charged; try again.

📸 [Screenshot: the balance card and the history table with a top-up row and a payment row naming the child]

---

### Page: Messages

**What this page tells you about your child:** nothing directly — but it is how you ask the people who know: their teacher, their assistant, or the centre.

**How to get there:** "Messages" in the menu — the **fourth item in the phone's bottom bar**.

**Sections:** two tabs (Direct and Groups) · your conversation list on the side · the open thread · a **"New conversation"** button.

**Who can you talk to?** **Your children's teachers, their assistants, centre management and reception staff** — nobody else. The list is built automatically from your children's approved links: it will never contain another parent, another student, or a teacher who does not teach your child.

**Actions:**

**a) Start a conversation:**
1. Press **"New conversation"**.
2. Contacts appear grouped by role (assistants first, then teachers, then the centre). Use the search box for a name.
3. Tap the name → the thread opens.
4. Type at the bottom and send.

**b) Report a problem:** from the safety menu at the top of a thread, choose **"Report"**, pick a category, add details and send. The report reaches the platform team.

**c) Block someone:** from the same menu choose **"Block"** and confirm. A block stops **both directions**, deletes no history, and is **reversible**.

**Special cases:**
- "Connection lost" at the top → temporary; messages send when the network returns.
- Empty list → you have not started any conversation; press "New conversation".
- Teacher not in the list → your child is not enrolled with them, or the link is not approved.

📸 [Screenshot: the "New conversation" dialog with contacts grouped by role]

---

### Page: Child safety

**What this page tells you about your child:** which adults they talk to on the platform, and what was said — **read-only**.

**How to get there:** "Child safety" in the menu.

**Read these five rules first — they are the page:**
1. You see your child's chats **with adults only** (teacher, assistant, centre management, staff) — never their chats with classmates.
2. **Read-only.** There is no place to type and no greyed-out reply button — the area simply ends, because no permission opens that door.
3. **Opening a thread marks nothing as read for your child** and shows them no read receipt.
4. **Your child knows.** A permanent notice on their own screen tells them their parent can see their chats with adults. This is transparency, not surveillance.
5. **A verified adult child keeps their privacy** — their card shows their name and a line explaining that their chats are private, with nothing to press.

**Sections:**
1. **Child cards:** each minor child's card carries an "Under 18" mark and their conversation count, and **the whole card is the control**. A verified adult child's card has a dashed border, the word "Private", and no control at all.
2. **After choosing a child:** a permanent (non-dismissable) notice reading "View only. Opening this does not mark anything read for your child." + the conversation list (partner name, role, message count, last message date) + the thread itself.

**Actions:** tap a child's card → tap a conversation → read → press **"Back to children"**. Nothing else.

**Special cases:**
- "No linked children yet" → link a child first.
- "No conversations with the team yet" → your child has not spoken to any adult.
- **"Could not load children / conversations / messages. Try again."** with a retry button → **this is not "there is nothing"**, it is "we could not read". The distinction is deliberate on a page like this: a parent must never read a failure as reassurance.
- A message shown as "message removed" → deleted by its sender; the text is not shown here (you are an observer, not a moderator).

📸 [Screenshot: a minor child's card next to a verified adult child's "Private" card]

---

### Page: Notifications

**What this page tells you about your child:** everything new — an absence, a grade, a payment, a cancelled lesson — newest first.

**How to get there:** "Notifications" in the menu, or the bell.

**What actually reaches you:**

| Event | Reaches you? |
|---|---|
| Your child marked absent | ✅ **You, instead of your child** |
| Attendance corrected | ✅ **You, instead of your child** |
| A new grade recorded | ✅ You **and** your child |
| A payment or refund recorded | ✅ You **and** your child |
| A lesson cancelled or postponed | ✅ |
| Material uploaded | ✅ |
| A new link request | ✅ in-app **and by email** |
| Lesson or homework reminder | ✅ |

**Channels:** always in-app, plus a phone notification **if you enabled it** in Settings. **No emails are sent for these types** — email is reserved for account matters (link requests, password reset).

**Sections:** the unread count at the top · a **"Mark all as read"** button (shown only when something is unread) · notification cards, unread ones in bold with a blue dot and a coloured side rule.

**Actions:**
1. **Tap any notification** → it is marked read **and takes you to the relevant page** (absence → Attendance, payment → Fees, grade → Grades, cancellation → Schedule).
2. **"Mark all as read"** → clears every highlight at once.

**Special cases:** none yet → an empty state with a bell icon · a notification that goes nowhere when tapped → its type has no dedicated page; it is only marked read.

📸 [Screenshot: the notifications list with an unread card (blue dot) and a faded read one]

---

### Page: Settings

**What this page tells you about your child:** nothing — this page is about you: your details and your account security.

**How to get there:** "Settings" in the menu.

**Sections, in order:**

1. **Account details — read-only:** email · role ("Parent") · account status.
2. **Editable details:** name · phone · interface language (العربية / English).
3. **Phone notifications:** enable/disable (see [2-5](#2-5-turning-on-notifications)).
4. **Password:** change it whenever you want.
5. **Devices and sessions:** every device your account is open on, with the option to end one session or all other sessions.
6. **Your data rights:** request **a copy of your data** or **deletion of your account** (Egyptian Data Protection Law 151/2020).

**Actions:**

**a) Edit your details:** change name/phone/language → press **"Save changes"** → a green confirmation appears. A language change takes effect immediately.

**b) Change your password:** open the password box → enter the current one, then the new one twice → save. **Note:** changing your password **signs you out of every other device** immediately — deliberately, to protect your account.

**c) End the session on a lost device:** from "Devices and sessions", end that device, or end all other sessions at once.

**Special cases:** "Save failed" → retry; nothing is saved partially · no phone-notifications box → your browser does not support it.
**Note:** two-factor authentication is currently offered to centre owners and teachers only, and does not appear in a parent's settings.

📸 [Screenshot: the full settings page with its six boxes]

---

## 4. Everyday questions

**1. How do I know my child attended today?**
1. Open **Attendance**. 2. Check your child's name in the top bar. 3. Look at today's square in the calendar: teal = present, amber = late, red = absent.
*(And if they were absent, a notification reaches you without your opening anything.)*

**2. How do I see the last test score?**
1. Open **Home**. 2. Read **Latest grades** — the last three. 3. For subject detail, open **Progress**.

**3. How do I check one particular subject?**
1. Open **Progress**. 2. Read that subject's row: percentage, grade band, number of assessments.

**4. How do I pay for one lesson right now?**
1. **Pay for a lesson**. 2. Confirm the child at the top. 3. Open the subject, then the lesson. 4. Pick the lesson from "Pick a lesson". 5. Press **"Pay for this lesson"**. 6. Choose card or wallet. 7. Wait for the confirmation.

**5. How do I pay for a whole month?**
Same steps, but press **"Pay monthly"** — no lesson to pick.

**6. How do I top up my wallet?**
1. **My wallet**. 2. **Top up**. 3. Enter the amount. 4. **Continue** and complete the card payment.

**7. How do I print a receipt?**
1. **Fees**. 2. Find the row. 3. Press the link under the receipt number. 4. Print the page or save it as PDF.

**8. How much did I pay this month?**
1. **Fees**. 2. Set "from" and "to" to that month. 3. Read **Net paid**.

**9. How do I contact the teacher?**
1. **Messages**. 2. **New conversation**. 3. Search their name and tap it. 4. Type and send.

**10. How do I read my child's chats?**
1. **Child safety**. 2. Tap your child's card. 3. Tap a conversation. *(Read-only, and your child knows.)*

**11. How do I add a second child?**
1. **Children**. 2. Enter their family code or email. 3. Link. 4. The child switcher appears automatically.

**12. How do I print my child's card?**
1. **Children**. 2. Press the card link on their row. 3. Press **Print** (or "Save image" to send it on WhatsApp).

**13. How do I silence notifications at night?**
**There is no time-based mute in the platform.** What you can do: turn phone notifications off entirely in **Settings → Phone notifications → Disable**, or use your phone's own Do Not Disturb. Everything is still kept on the Notifications page.
⚠️ [needs a decision from the team: add quiet hours, or per-type control?]

**14. How do I switch the platform to Arabic/English?**
**Settings** → Language → choose → **Save changes**.

**15. How do I unlink from a child?**
1. **Children**. 2. **Unlink** on their row. 3. Confirm in the dialog. *(Their data closes to you immediately.)*

---

## 5. Troubleshooting

**1. The family code says "invalid or expired".**
Ask your child for the **current** code — they may have rotated it after sending, which kills the old one instantly. Also check you copied it whole, with no spaces.

**2. I got "Student already has an active parent link".**
A student is linked to **exactly one** parent. If the other account belongs to a family member, they open their own Children page and press "Unlink", then you retry.
⚠️ [needs a decision from the team: a mother and a father cannot both follow the same child today.]

**3. I sent a link request and nothing happened.**
An email/phone request **waits for your child's approval**. Remind them to open their notifications and press Approve. For an instant link with no waiting, use the family code.

**4. I only see one child although I have two.**
Check three things: (a) is the second child **Approved** on the Children page? (b) the switcher **does not appear at all** with only one approved child; (c) the second request may still be Pending.

**5. I get no notifications on my phone.**
(a) **Settings → Phone notifications → Enable**, then press "Allow" in the browser's prompt. (b) If the button is disabled the browser is blocking: padlock next to the address → Notifications → Allow. (c) On iPhone, add the platform to your home screen first (Share → Add to Home Screen). (d) Either way, everything is on the Notifications page.

**6. All the numbers are zero.**
Check the selected child. Most likely the teacher has recorded no attendance or grades yet — zero here means "no data", not "zero performance".

**7. I saw "We could not load your children".**
That is a temporary connection problem, **not a broken link**. Refresh. If it repeats, try another network, then contact support.

**8. I cannot find my child's teacher in the contacts list.**
The list is built from your child's approved link and their actual lessons. Check the link is Approved and that your child is enrolled with that teacher.

**9. I paid but the subscription is not active.**
Open **Fees**: if the payment shows with a receipt number, it went through. If it does not appear within a few minutes and nothing was charged, try again — an incomplete payment is not charged. **Do not pay twice before checking the Fees page.**

**10. "Pay from my wallet" does nothing.**
Your balance is lower than the amount. Top up from My wallet, or pay by card.

**11. A lesson says "Not available for online payment".**
The teacher has not set prices for it. Pay cash at the centre; it will appear in Fees automatically afterwards.

**12. My child's card says their profile is incomplete.**
The missing details are completed **by your child from their own account**. Attendance and payment are unaffected; only the printed card is withheld.

**13. I forgot my password.**
On the sign-in screen press **"Forgot password"**, enter your email and follow the link you receive. Setting a new password **signs you out of every device**.

**14. I think someone accessed my account.**
1. **Settings → Devices and sessions** → end all other sessions. 2. Change your password immediately. 3. Contact support.

---

## 6. Glossary

| Term | In plain words |
|---|---|
| **Family code** | A short code held by your child; whoever types it links **instantly**. Your child can change it at any time, which kills the old one. |
| **Student code** | The 8 characters on your child's card, including a check character so that one mistyped letter can never resolve to **a different child**. It is what the centre uses for check-in and payment. |
| **Approved** | The link is active and your child's data is open to you. |
| **Pending** | Sent, not yet answered. No data before approval. |
| **Revoked** | A link that was approved and then ended by one of the two parties. |
| **Monthly subscription** | One month paid up front. **It does not auto-renew** — you pay again when you choose to. |
| **Single lesson** | Payment for one specific lesson at its date and time. |
| **Wallet** | A balance you load by card and spend later in one tap. Yours is separate from your child's. |
| **Receipt** | The official document for every payment, with a unique number, printable. |
| **Refund** | Money returned to you; shown as a negative amount in the fees table. |
| **Late** | Your child arrived after the lesson started. A status of its own — neither full attendance nor absence. |
| **Track (شعبة)** | The academic stream (science, arts, …) that determines your child's subjects. |
| **Oversight (child safety)** | Reading your minor child's chats with adults **without** the ability to write, and without touching their unread counters. |
| **Minor / verified adult** | Every student is treated as a minor by default until an age of 18+ is proven with a verified date of birth. A verified adult's chats stay private. |
| **Session (devices)** | Each device your account is open on is one "session" and can be ended individually. |
| **PWA / install** | Adding the platform to your phone's home screen so it opens like an app and can receive notifications. |

---

## 7. Open items for the team ⚠️

| # | Item | Where | Type |
|---|---|---|---|
| 1 | **Stale copy on the Fees screen contradicts the product:** "a parent cannot pay directly yet", while "Pay for a lesson" ships and works. | `messages/{ar,en}/parent.json` → `parentFees.payLimit` | Bug to fix |
| 2 | **Payment gateway is in mock mode** — a "Test mode" dialog appears instead of the card page. The card paragraph gets final wording once Paymob is configured. | Pay / Wallet screens | Awaiting config |
| 3 | **Final platform address** — `app.edura.eg` is configured, the domain is not live. | Section 2-1 | Missing |
| 4 | **Arabic brand spelling** — is «إدورا» the approved form? | Title and throughout | Missing |
| 5 | **No native iOS/Android apps** — the product is web + install-from-browser. What do we tell parents? | Section 2-5, glossary | Marketing decision |
| 6 | **The "email or phone" tab accepts email only** in the UI, though the server accepts both. | `parent-linking-screen.tsx` | UI/server mismatch |
| 7 | **One student = one parent.** A mother and father cannot both follow the same child. | `parent-links.ts` | Business decision |
| 8 | **The selected child is not remembered** between sessions; it resets to the first child. | `child-selector.tsx` | Improvement |
| 9 | **No fine-grained notification control** (no quiet hours, no per-type choice) — only push on/off. | Settings | Improvement |
| 10 | **Email verification is not enforced** at sign-up. | Parent registration | Security decision |
| 11 | **"Invalid or expired family code"** mentions expiry, but codes have no time-based expiry. | `parent-links.ts` | Copy accuracy |

---

## 8. Pre-publication checklist

- [ ] Fix the `parentFees.payLimit` copy (item 1), or add an explicit note in the guide.
- [ ] Confirm the platform address and the Arabic brand spelling (3, 4).
- [ ] Write the final card-payment paragraph once Paymob is live (2).
- [ ] Settle "one parent per student" before publishing — it will be asked about constantly (7).
- [ ] Capture the 12 screenshots marked `📸` in section 3, **in Arabic and in light mode**, using demo data only.
- [ ] Have a non-technical reader proof the language.
- [ ] Test the guide with a real parent: hand it over and ask them to link a child unaided, and record where they stall.
- [ ] Keep this English version in step with any change to the Arabic one.
