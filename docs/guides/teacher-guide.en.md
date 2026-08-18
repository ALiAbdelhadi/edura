# Teacher Guide — Edura

> **Status:** first publishable draft · written 2026-08-09 · every fact below is taken from the shipped code in `apps/www`, not from designs or plans.
> **Arabic version (primary):** [teacher-guide.md](teacher-guide.md)
> **For the team:** anything needing a decision or confirmation is marked ⚠️ inline and collected in [10.4](#104-open-items-for-the-team).
> **How to read this guide:** each step is one action. Text in "quotes" is the exact button or message as it appears on screen in the English interface — if what you see differs, tell the team. ⚠️ marks an action that cannot be undone, or a decision that changes how your team works.

## Contents

- [0. Before you start](#0-before-you-start)
- [1. What this platform does for you](#1-what-this-platform-does-for-you)
- [2. First-time journey (onboarding)](#2-first-time-journey-onboarding)
- [3. How you get paid](#3-how-you-get-paid)
- [4. Page-by-page tour](#4-page-by-page-tour)
- [5. Your team: assistants](#5-your-team-assistants)
- [6. How-to recipes](#6-how-to-recipes)
- [7. Working offline and installing the app](#7-working-offline-and-installing-the-app)
- [8. FAQ and troubleshooting](#8-faq-and-troubleshooting)
- [9. Glossary](#9-glossary)
- [10. Checklists, and what the team must confirm](#10-checklists-and-what-the-team-must-confirm)

---

## 0. Before you start

Have these ready — all of them are needed in the first ten minutes:

1. **An email address you actually use** — it is your sign-in name, and it receives password-reset links and centre invitations.
2. **An Egyptian phone number** in the form `01XXXXXXXXX` (optional at sign-up, but enter it — it is how a centre finds you).
3. **The list of grades you teach, and your subjects** — you pick them from a ready catalogue; you do not type them.
4. **A profile photo** with a clear view of your face (students and parents see it).
5. **An up-to-date browser** (Chrome, Safari or Edge). The platform runs in the browser, and **there is no app on the App Store or Google Play** — but you can install it onto your phone's home screen from the browser itself ([section 7](#7-working-offline-and-installing-the-app)).

⚠️ This guide refers to "Terms of Service" and "Privacy Policy" as they appear on the sign-up screen. If final URLs exist, add them here.

---

## 1. What this platform does for you

Edura runs the administrative and financial side of your work and leaves you the teaching:

- **Your lessons are scheduled automatically.** Set the days and times once, and every session of the class is generated with its date.
- **One attendance record nobody can dispute.** The counter records, your assistant confirms at the door, you see the result — and the screen works **even with no internet** inside the classroom.
- **Grades in one place** — one assessment, one screen for all your students, and a computed average.
- **Your money is calculated in front of you, not in your head.** Before you close a lesson you see your share, the centre's share and the platform's share per attending student, then you press once and it is credited to your wallet.
- **Assistants who act on your behalf** — with every action still attributed to you in the audit trail.
- **An official channel** to students and parents, instead of your personal number.

**What the platform does not do:** it does not collect money from the student in place of the centre if you teach inside a centre (the counter collects), it does not teach for you, and it does not let you edit the platform's rates.

---

## 2. First-time journey (onboarding)

### 2.1 Creating your account

1. Open the sign-up page `/register` (or tap "Sign up" below the sign-in form).
2. In the **"I am a"** field choose **"Teacher"**. The description shows: "I want to teach my own students", and below the form you will see: **"This account type is reviewed by the Edura team before you can sign in."** — do not skip that line; it is what the next step is about.
3. Enter your **"Full name"** exactly as you want students and parents to see it (it appears in messages and on classes).
4. Enter your **"Email"**. Check the spelling and the domain before continuing; a reset link will never reach a mistyped address.
5. Enter your **"Phone (optional)"** as `01XXXXXXXXX`. Anything else is rejected with: "Enter a valid Egyptian number (01XXXXXXXXX)".
6. Enter your **"Password"**. The rule: **at least 8 characters, including at least one letter and one digit.** Anything shorter shows: "Password must be at least 8 characters".
7. Retype it in **"Confirm password"**. A mismatch shows: "Passwords do not match".
8. Read the consent line below the form — **"By creating an account you agree to the Terms of Service and Privacy Policy"** — then press **"Sign up"**.

**Edge cases and expected errors:**

| What you see | What it means | What to do |
|---|---|---|
| "This email or phone number is already registered." | You have an older account, or a centre created a preliminary one for you | Try "Forgot password?" with the same email before creating a new address |
| "Please correct the highlighted fields and try again." | One or more fields are not acceptable | The bad fields are highlighted — fix those, do not retype the whole form |
| "Registration failed. Please try again." | A temporary interruption | Retry shortly with the same details — you will not end up with two accounts |

📸 [Screenshot: the sign-up form with "Teacher" selected and the review notice showing below it]

### 2.2 "Account created — awaiting review"

After you press, you will not land in the dashboard. The page becomes:

> **"Account created — awaiting review"**
> "Your account was created successfully. The Edura team reviews it before activation, and you will be notified once it is approved. You can sign in after that."

**This is neither an error nor a rejection.** Teacher and centre accounts are reviewed before activation because the account will be tied to real students and to money.

**If you try to sign in before approval**, your password is accepted and then you see an explicit message:

> "Your account is still under review by the Edura team. We'll notify you as soon as it is approved, and you can sign in then."

⚠️ **Careful:** do not create a second account under another address because the first "doesn't work". The account is fine and simply waiting, and a duplicate confuses the centre's attempts to link you later.

**If the wait drags on:** contact support and give them the exact address you signed up with.

⚠️ [Needs confirmation from the team: the expected review time, and the official support channel (email / WhatsApp / phone)?]
⚠️ [Needs confirmation from the team: is an email sent on approval, or only an in-platform notification?]

📸 [Screenshot: the "Account created — awaiting review" message]

### 2.3 First sign-in and completing your teaching profile

Once approved, sign in at `/login` with your email and password. **You are taken straight into the setup wizard** and will not see the dashboard until you finish it. Its heading:

> "Welcome! Let's set up your teaching profile — Pick the grades and subjects you teach so we can match you with the right students."

The wizard is two steps plus a review, with "Step 1 of 3" shown above it:

**Step one — "Grades you teach":**

1. Tap every grade you teach. **You can pick more than one** (the prompt says so: "you can pick more than one").
2. Press **"Next"**. If you picked nothing you will see: "Pick at least one option".

**Step two — "Subjects you teach":**

1. Note that the list is **filtered to the grades you selected** — if a subject is missing, the usual reason is that its grade was not selected in the previous step. Press "Back" and add the grade.
2. Use the **"Search subjects"** box to move quickly.
3. Select all your subjects.
4. **If your subject genuinely does not exist:** press **"Can't find your subject? Request it"**, fill in "Suggested subject name" and "Notes (optional)", and submit. You will see "Request sent for review" — the request goes to the platform admins and **does not add the subject immediately**, so finish setup with the subjects available now.
5. Press **"Next"**.

**Step three — review:** check "Selected grades" and your subject count, then press **"Confirm & save"**. You will see "Your profile has been saved!" and the dashboard opens.

💡 **Tip:** the wizard saves your progress ("Your progress is saved — you can close this and pick up where you left off"), so closing the page is safe. When you return you will see: "We restored your previous selections".

📸 [Screenshot: the "Subjects you teach" step with the search box and the request-a-subject button]

### 2.4 Your profile photo

1. In the sidebar, open **"Settings"**.
2. In the teacher-photo card, pick an image from your device.
3. Wait for the new photo to appear in place — there is no separate "save" button after a successful upload.

💡 Use a clear head-and-shoulders photo on a plain background; it is the first thing a parent sees before deciding to subscribe for their child.

### 2.5 The most important setting you own: "Attendance mode"

⚠️ This decision **changes how your team works every day**, so read it before choosing. It lives in **Settings → "Attendance mode"** and has two options:

| Option | What it says on screen, verbatim | When to choose it |
|---|---|---|
| **"Counter only"** (default) | "The front-desk check-in alone marks the student present." | You have no assistant at the classroom door, or the room is small and the counter can see it |
| **"Counter + door"** | "Your assistant confirms students at the classroom door; counter alone shows as 'at center — didn't attend class' and does NOT count as present." | Real crowding, students who pay and then don't come in, and you have an assistant on the door |

**The direct financial effect:** in "Counter + door" mode, a student who passed the counter but was not confirmed at the door is tagged **"At center — didn't attend class"** and **is not counted in the lesson's distribution**. In other words, your share is computed over whoever actually entered the room.

**Steps to change it:**

1. Open "Settings".
2. In the **"Attendance mode"** card, pick the mode you want.
3. Wait for **"Attendance mode saved"**. If you see "Could not save the attendance mode", try again.

⚠️ **Careful:** do not switch on "Counter + door" before someone is actually standing at the door and knows the screen. Otherwise your students will pass the counter, nobody will be counted present, and your lessons will close with nothing to distribute.

📸 [Screenshot: the "Attendance mode" card with both options and their full descriptions]

### 2.6 Securing your account (five minutes, once)

Everything below is on the **"Settings"** page:

**a) Password**

1. Open the **"Password"** card.
2. Enter "Current password", then "New password", then "Confirm new password" (at least 8 characters, including a letter and a digit).
3. Press **"Change password"**.

⚠️ **Careful:** changing your password **signs you out of every device, including the one in front of you** — that is deliberate protection. The message shown: "Password changed — please sign in again".

**b) Two-factor authentication (2FA) — strongly recommended**

1. Open the **"Two-factor authentication (2FA)"** card and press **"Enable 2FA"**.
2. Confirm your password when asked.
3. **Scan the QR code** with an authenticator app (Google Authenticator, Authy), then type the 6-digit code and press **"Confirm"**.
4. **"Backup codes"** appear. Press **"Copy codes"** and store them somewhere safe, away from your phone.

⚠️ **Careful:** each backup code works **once**, and they are your only way in if you lose your phone. Do not store them on the same phone that holds the authenticator app.

**c) Devices & sessions**

1. Open the **"Devices & sessions"** card — it lists every device currently signed in, with "Last active" and a "This device" tag.
2. For any device you do not recognise, press **"Sign out"**.
3. If you suspect a lost phone, press **"Sign out all other devices"** — only your current device remains.

**d) Notifications** — from the notifications card, enable browser notifications so alerts reach you while you are away from the platform (accept the browser prompt when it appears).

📸 [Screenshot: the full Settings page showing the attendance-mode, password, 2FA and devices cards]

### 2.7 Where your students come from: the two paths

Before creating any class, understand that there are two paths, and **you can work both at once**:

| | **a) Inside a centre** | **b) Your own group** |
|---|---|---|
| Venue | The centre's hall | Your own venue, or online |
| How it starts | A collaboration request between you and the centre (from either side) | You create the group yourself from "My Classes" |
| Collection | Cash at the centre counter, or online | Online / student or parent wallet |
| Deducted from the revenue | Platform share **+ centre or hall share** | Platform share only |
| When your share lands | **When the lesson is closed** | **At payment time** (not on closing) |

That last difference matters a great deal, and [section 3](#3-how-you-get-paid) returns to it.

### 2.8 Path (a): working inside a centre

Where: **"My Centers"** in the sidebar. The page has two parts: your centre affiliations, and below them **"Collaboration requests"**.

**If the centre invited you (an affiliation invite):**

1. Open "My Centers". The invite appears as **"Pending"** with "Expires" and a "days left" count.
2. Press **"Accept"**. A confirmation appears: "Accept this invitation? You'll be able to teach courses at this center" — press "Accept".
3. Or press **"Decline"** and confirm.

⚠️ **Careful:** an invite **expires**. Once its status reads "Expired" you cannot accept it, and the centre will have to send a new one.

**If you want to apply to a centre (a collaboration request):**

1. In the **"Collaboration requests"** card press **"Apply to teach at a center"**.
2. Pick the centre from **"Pick a center…"**.
3. Choose **"Subject"** and **"Grade"**, and the track if relevant (or "All tracks").
4. Choose **"Hall (optional)"**. Picking a hall shows its details: seat count, upcoming booked times, and **how the centre's share is priced**:
   - **"Whole-room percentage"** — "The hall takes a fixed percentage of each lesson."
   - **"Per attending student"** — "The hall's share is calculated per student who actually attends each session. No fixed price — it depends on attendance", with the figure shown explicitly as "{value} per attending student" or "{value}% of the lesson price per attending student".
   - You may also see: "This hall offers both pricing methods — the teacher chooses one when accepting."
5. Set **"Days"**, **"From"**, **"To"** and **"Start date"**, plus **"Expected students"** if you know it.
6. Add a **"Message"** (optional) and press **"Send request"**. You will see "Collaboration request sent"; the request appears tagged **"Sent by you"** and you can **"Cancel"** it before a reply.

**If a request arrives from the centre:** it is tagged **"Incoming — your decision"**.

1. Review the grade, the schedule and the **"Center share"**.
2. Press **"Accept"**. If the hall offers both methods you are asked first: **"Choose the pricing method"** — read each description and choose.
3. Confirm in the dialog: **"Accept collaboration? — Accepting creates the affiliation, the class, and its full session schedule in one step."**
4. You will see: **"Accepted — class and schedule created. Set prices so students can subscribe."**

⚠️ **Careful — this is the most important message on the screen:** accepting created the class and its sessions **with no price**. In that state **no student can subscribe**, and **its lessons cannot be closed or distributed**. Go to [2.9](#29-path-b-and-pricing-creating-your-own-group) straight away.

**A note on rates:** revenue-split figures are set by the platform, not by you and not by the centre — the screen says so plainly: "The center's share is set by the platform. Neither the teacher nor the center enters an amount."

📸 [Screenshot: the "Collaboration requests" table with one "Incoming — your decision" row and one "Sent by you"]
📸 [Screenshot: the "Choose the pricing method" dialog with both descriptions]

### 2.9 Path (b) and pricing: creating your own group

Where: **"My Classes" → "Create group"**.

1. Press **"Create group"**.
2. Enter the **"Group name"** — the on-screen example is "Math — Grade 12". Make it name the subject and grade; this is what the student sees.
3. Choose **"Subject"** (required) and **"Grade (optional)"**.
4. Enter the **"Location (optional)"** — "Your own venue or online".
5. Set **"Days"**, and **"From"** and **"To"** (the lesson times).
6. Set **"Start date"** and **"End date"** — from these, and the days, **every session of the class is generated automatically**.
7. Set **"Max students"**.
8. Set the price: **"Monthly price (EGP)"** and/or **"Per-session price (EGP)"**. The rule printed below the fields: **"Set at least one plan price — monthly or per-session."**
9. Press **"Create group"**. You will see "Group created — {count} sessions generated".

**About the two plans — which do you price?**

- **Monthly price:** a month's commitment, renewed by the student paying again (there is no automatic charge).
- **Per-session price:** pay-as-you-go, and it is **what the counter charges a student attending today only**.
- Price **both** if you want to serve both kinds; the student picks at checkout.

⚠️ **Careful — the unpriced-class marker:** if you open a class and see the notice **"This class has no monthly or per-session price yet — students cannot subscribe until the center sets one"**, the class is effectively disabled: no subscriptions, no collection, no lesson closing. **Classes created by accepting a collaboration request always start this way** — and pricing them is the class owner's job (the centre, on the collaboration path).

⚠️ [Needs confirmation from the team: can a teacher edit the price of a class created by accepting a collaboration request, or is pricing the centre's right alone? The on-screen message attributes pricing to the centre.]

📸 [Screenshot: the "Create group" dialog with all its fields and the plan note below them]
📸 [Screenshot: the unpriced-class notice inside "My Classes"]

### 2.10 How students actually join

Once the class has a price, a student joins in one of these ways — and **all of them end with the student appearing in your roster automatically**:

1. **The student searches and subscribes themselves** from their portal (they find the group by their subject and grade) and pays online or from their wallet.
2. **A parent pays for their child** from their own portal.
3. **The counter registers them for cash** — the most common case in a centre: the student pays at the counter and is checked in to the same lesson.
4. **A brand-new student walks into the centre** — the counter creates an account for them and hands over a link to complete their details.

⚠️ **Careful:** you **do not add a student to your class yourself from the teacher portal.** Joining always runs through the payment/registration path, so that every student on the roster has known payment coverage — and that is exactly what makes your share correct when you close the lesson.

💡 **Practical tip for week one:** after the first lesson, open "My Classes" and view the class roster. Everyone who paid is there. If someone says they paid and you cannot find them → see [section 8](#8-faq-and-troubleshooting) before you let them into a lesson.

---

## 3. How you get paid

> **Read [3.3](#33-the-decisive-rule-no-money-before-the-lesson-is-closed) and [3.4](#34-the-close-the-lesson-and-distribute-it-card) before the first lesson you teach.** The most common question a teacher asks in month one is "I taught lessons and my wallet is empty" — and the whole answer is in those two subsections.

### 3.1 How the student pays: three paths

Your money begins with a payment made by the student or their parent, in one of three ways:

| Path | Who performs it | When it is used |
|---|---|---|
| **Cash at the centre counter** | Counter staff | The most common route inside a centre — the student pays and is checked in to today's lesson in one step |
| **Online payment** (bank card or mobile wallet) | The student or parent, from their portal | Monthly subscriptions, your own groups, and paying in advance |
| **From a wallet** — the student's wallet or the parent's | The student or parent | A pre-loaded balance the subscription or lesson price is deducted from |

**What of this is yours to do:** nothing procedural. You **do not take money by hand inside the platform** and you do not record a payment for a student. Your job starts after the payment: take attendance, then close the lesson.

⚠️ [Needs confirmation from the team: which online payment methods are available to students at launch (card only? mobile wallets?), and is the payment gateway currently in test or live mode?]

### 3.2 Who deducts what

From the lesson price per student, fixed shares are taken, and **the remainder is yours**:

1. **The platform's share** — Edura's commission. It is set by the platform's administration; you never see it as a percentage you can edit, only as an amount calculated in front of you before closing.
2. **The centre's or hall's share** — which is **zero if the group is your own**. Inside a centre it is computed in one of three ways, depending on what was agreed at collaboration time:
   - **"Whole-room percentage"** — a fixed percentage of each lesson.
   - **"Per attending student"** — "The hall's share is calculated per student who actually attends each session. No fixed price — it depends on attendance." It is shown explicitly when you pick the hall, as "{value} per attending student" or "{value}% of the lesson price per attending student".
   - **A fixed affiliation share** agreed with the centre.
3. **Your share = the remainder.** Not a percentage computed for you, but what is left after the platform's and the centre's shares — which is why all three figures appear in front of you before you press: the sum has to convince you.

**Two guarantees that protect you:**

- **The rates are set by the platform, not by the centre.** The screen says: "The center's share is set by the platform. Neither the teacher nor the center enters an amount."
- **Pricing is fixed when the class is created** — "it is fixed on the class when it is created". So a centre changing its hall's rate later **does not re-price your existing class.**

⚠️ **Careful:** under "Per attending student" there is **no lesson price known in advance**; the cost depends on how many attend. Before accepting, read the figure printed on the hall card and work out your worst case (a lesson with few students).

### 3.3 The decisive rule: no money before the lesson is closed

⚠️ **A student's payment does not mean your money has landed.** The full sequence:

```
Student pays  →  Attendance recorded  →  You close the lesson  →  Revenue credited to the wallets
```

A lesson you taught and took attendance for **but never closed stays pending forever**: the student's money is held and recorded, but your share has not been credited. Nobody closes it on your behalf, and no nightly job closes it automatically.

**The one exception — your own group:** if the group is teacher-direct (no centre), distribution happens **at payment time**, and the closing card will carry this sentence verbatim:

> "This class is teacher-direct; its revenue is distributed at payment time, not when the lesson closes."

So there is nothing to wait for there, and nothing wrong with the missing button.

💡 **The habit that saves your whole month:** make closing the lesson the last step of every lesson, right after saving attendance while you are still in the room. A pile-up of unclosed lessons is the most common cause of an empty wallet.

### 3.4 The "Close the lesson and distribute it" card

**Where:** "Attendance" → pick the lesson → press "Mark attendance" → the card sits below the student list. (The centre can also close it from the week schedule — the same card and exactly the same conditions, so there is no "easier" route that skips anything.)

**Steps:**

1. **Take attendance first and save it.** The card reads saved attendance, not what is on the screen.
2. Read **"Students present"** — the count the distribution will be computed over.
3. Read **"Lesson price per student"**.
4. Read **"Each party's share, per student"**: **"Teacher"**, **"Center"** and **"Platform"**. Add them up mentally and check the total equals the lesson price.
5. Read **"Teacher's total"** — this is what will enter your wallet.
6. Press the button that carries the amount itself: **"Close the lesson and distribute EGP {amount} across {n} students"**. The button carries the number deliberately, so you cannot press "confirm" on an amount you never read.
7. The button becomes **"Final confirmation — press to distribute"** with the note: "Written to the ledger in your name, and credited to the teacher's and the center's wallets immediately." Press it to execute.
8. Wait for **"Lesson closed and its revenue distributed"**. If you see "Could not close the lesson", nothing was written — retry, or check the reasons below.

⚠️ **Careful — this cannot be undone.** The warning printed on the card: **"The distribution is written to the ledger once, and cannot be undone."** The ledger is never edited or erased; any later correction is **a new, opposite entry** shown beside the original, not a deletion of it. So: **read the present count before you press**, because marking an absent student present cannot be fixed with an undo.

**If the button is missing: the six reasons, and what to do about each.** The card **tells you the reason in words** rather than showing a disabled button:

| What you read on screen | What it means | What to do |
|---|---|---|
| "No students are marked present, so there is nothing to distribute. Take attendance first." | Nobody's attendance was saved | Take attendance, save, then reopen the card |
| "This class has no price, so the lesson would distribute nothing. Set the class pricing first." | An unpriced class (very common on classes created by accepting a collaboration) | Price the group — or ask the centre to. **Do not close the lesson**: closing it unpriced is refused so that a lesson is never burned at zero forever |
| "The hall's per-student fee exceeds this lesson's price — fix the class pricing first." | The hall's share per student is more than the student pays | Review the group's pricing with the centre before closing |
| "The lesson is cancelled, so there is nothing to distribute." | A cancelled lesson | Nothing — this is normal |
| "This lesson was already closed and distributed on …" | Already closed, with the date shown | Nothing. The money was credited — check "Recent wallet transactions" |
| "This class is teacher-direct; its revenue is distributed at payment time…" | Your own group | Nothing — your share landed at payment time |

⚠️ **The most dangerous of these is "has no price"**, because it is the one where a teacher assumes the problem is a button. It is not the button: the class cannot be collected against at all, and your students cannot subscribe to it either.

📸 [Screenshot: the "Close the lesson and distribute it" card with all figures filled and the button carrying the amount and student count]
📸 [Screenshot: the same card showing the "This class has no price…" reason instead of the button]

### 3.5 The wallet: three numbers, not one

**Where:** "Wallet" in the sidebar — "Your earnings, available balance, and payout requests."

| The number | Exactly what it means |
|---|---|
| **"Wallet balance"** | Everything owed to you on the platform right now |
| **"Available to withdraw"** | What you can request a payout of today |
| **"Reserved by open requests"** | An amount you already requested that has not been paid yet — kept for you, and held back from a new request |

**This is why "Available to withdraw" is lower than "Wallet balance":** the difference is reserved by an open payout request, not missing. And if the available amount is zero you will read: **"Nothing available — funds are reserved by open requests or the balance is empty."** — the sentence carries both diagnoses, so check "Payout requests" first.

### 3.6 Requesting a payout, step by step

1. Open **"Wallet"**.
2. Press **"Withdraw earnings"**. (If the button does nothing useful, the line beneath it explains why — see [3.5](#35-the-wallet-three-numbers-not-one).)
3. A dialog shows **"Available now"** and its amount. Read it.
4. In **"Amount (EGP)"** type the amount you want, **or leave it empty** — "Empty = withdraw the full available balance."
5. Press **"Request payout"**.
6. Wait for **"Payout request submitted"**. If you see "Enter a valid amount", check what you typed (digits only, not more than what is available).

**Track the request** in the **"Payout requests"** table, whose columns are: "Amount" · "Status" · "Requested" · "Paid" · "Note".

**The four statuses:**

| Status | What it means | What to do |
|---|---|---|
| **"Pending"** | The request arrived and is awaiting finance review | Wait. The amount is reserved for you and does not show in "Available to withdraw" |
| **"Approved"** | Approved but not yet paid out | Wait for payment; "Paid" will show a date once executed |
| **"Paid"** | Paid to you | Check "Paid", and you will find a payout entry in "Recent wallet transactions" |
| **"Rejected"** | The request was refused | **Read the "Note" column** — the reason is there. The amount returns to "Available to withdraw" |

⚠️ [Needs confirmation from the team: the actual payout method for a teacher (bank transfer / mobile wallet / cash from the centre), where the teacher records those details, the expected time between "Approved" and "Paid", and whether there is a minimum payout amount?]

📸 [Screenshot: the Wallet page with its three numbers and the "Payout requests" table showing two different statuses]

### 3.7 "Recent wallet transactions", the ref, and refunds

The **"Recent wallet transactions"** table sits at the bottom of the page, with columns: **"Ref"** · **"Type"** · **"Amount"** · **"Date"**.

**The entry types that concern you:**

- **Payment** — your share of a closed lesson, or of a direct payment to your own group.
- **Commission** — the platform's share, deducted.
- **Payout** — an amount paid out to you.
- **Refund** — the reversal of an earlier payment.
- **Adjustment** — an administrative correction.

**"Ref"** is the entry's number. **Quote it verbatim in any financial query**; it identifies one row among thousands in a second, in a way that "Tuesday's lesson" never will.

**About refunds:** if a student's payment is refunded after its lesson was closed, **your original entry is not erased**; a **"Refund"** entry appears opposite it and the balance drops accordingly. The ledger tells the whole story: what happened, and what was corrected. **That is why you sometimes see a negative amount** — it is not an arithmetic error.

### 3.8 What you cannot do with money — and why that is in your favour

These are not formalities; they are what makes your figures provable in any dispute:

- **You cannot edit the platform's percentage or the centre's share.** They are set by the platform's administration, and the screen says so.
- **You cannot record a payment for a student or take cash inside the platform.** The counter does that, and its payment is documented by a receipt.
- **You cannot edit or delete any ledger entry** — nobody can, not even platform administration. Corrections are new entries only.
- **You cannot close a lesson twice**, nor close one that is unpriced or has nobody present.
- **You cannot see any other teacher's wallet**, and nobody sees yours except finance.
- **You cannot set your own payment date.** Your request is reviewed, and a refusal comes with a written reason.

💡 **One last practical rule:** on the last day of each month, open "Attendance" and confirm there is no old lesson left unclosed, then open "Wallet" and request a payout of what is available. Two minutes prevent months of pending dues.

---

## 4. Page-by-page tour

> **The template on every page:** purpose · how to get there · components · actions · edge cases · 💡 · 📸

### Page: Dashboard

**Purpose, and when you use it**
A page that answers one question: "what do I have today?". Open it as you sign in, then move on to "Attendance". Nothing is managed from it — it is read-only.

**How to get there**
The first item in the sidebar ("Dashboard"), and the page that opens automatically after signing in.

**Components, section by section**

1. **Four numbers at the top:**
   - **"Classes Today"** — how many lessons you have scheduled today.
   - **"Pending Grades"** — assessments you created whose grades are not entered. This is a backlog figure, not a statistic.
   - **"Total Students"** — your students across all classes.
   - **"Attendance %"** — overall attendance among your students.
2. **"Today's Schedule"** — a table with columns: "Time" · "Duration" (shown as "{mins} min") · "Subject" · "Room" · "Status". Status is either **"Done"** or **"Upcoming"**. On an empty day you read: "No classes scheduled for today."
3. **"Weekly Attendance Trend"** — a chart of how attendance moves week to week.
4. **"Pending vs Graded by Class"** — shows you exactly which class has the marking backlog, rather than one opaque total.
5. **"Score Distribution"** — how your students' scores are spread.

**Actions, step by step**

*Reading your day in thirty seconds:*

1. Read **"Classes Today"**; zero means nothing is scheduled today.
2. Review **"Today's Schedule"** and identify the next lesson (time and room).
3. Read **"Pending Grades"**; if it is above zero, open "Gradebook" after your lessons.
4. Read **"Room"**: **"TBD"** means the room has not been assigned yet — check with the centre before the lesson.

**Edge cases and expected errors**

- **"Loading dashboard…" never finishes:** your connection is weak or gone. Reload; and if you are in a room with no internet, go straight to "Attendance" — that page works offline.
- **A lesson you taught still says "Upcoming":** the status follows the schedule and the closing, not your say-so. Go to "Attendance" to close it.
- **Charts empty with messages like "No attendance trend yet.":** normal in the first fortnight — there is not enough data yet.

💡 **Tip:** "Pending Grades" is the one indicator parents experience as lateness on your part. Make ending the week at zero your target.

📸 [Screenshot: the whole dashboard — the four numbers, today's schedule and the three charts]

### Page: My Centers

**Purpose, and when you use it**
Every relationship you have with a centre in one place: where you are accepted, which invite awaits your decision, and which collaboration request you sent or received. Open it when starting with a new centre, and when an invite notification arrives.

**How to get there**
Sidebar → **"My Centers"**.

**Components, section by section**

1. **The "My Centers" card** — your affiliations, with columns: "Center" · "Status" · "Invited" · "Expires" · "Actions". The card header carries a **"{count} pending"** counter for invites waiting on you.
   - Statuses: **"Active"** (you teach there) · **"Pending"** (your decision) · **"Declined"** · **"Expired"** · **"Removed"**.
   - The "Expires" column shows **"{count} days left"**, or **"expired"**.
   - With no affiliations you read: "No center affiliations yet. An admin can invite you via email."
2. **The "Collaboration requests" card** — columns: "With" · "Class" · "Schedule" · "Center share" · "Status" · "Actions", each row tagged **"Incoming — your decision"** or **"Sent by you"**, possibly with "~{count} students expected" and a **"Set by platform"** tag on the centre share. The **"Apply to teach at a center"** button sits at the top of the card.

**Actions, step by step**
The full steps (accepting an invite · applying to a centre · answering an incoming request · choosing the pricing method) are in [2.8](#28-path-a-working-inside-a-centre) and are not repeated here.

*Cancelling a request you sent:*

1. Find the row tagged **"Sent by you"**.
2. Press **"Cancel"**. You will see: "Request cancelled".

**Edge cases and expected errors**

- **An invite now "Expired":** it cannot be accepted — ask the centre to send a new one.
- **An affiliation now "Removed":** the centre ended the relationship. Your past classes and their records **are not erased**, but no new classes are created with them.
- **"Action failed":** a reply that was not recorded — reload and check the status before pressing again, since the other side may have changed it.
- **An empty hall list:** "This center has no halls listed yet" — send the request with **"No specific hall"**, or check with the centre.

⚠️ **Careful:** accepting **creates the class and its full session schedule immediately** — it is not an expression of intent. Do not accept a schedule whose days and times you have not reviewed.

💡 **Tip:** before accepting, read the "Center share" and "Schedule" columns in the same row, and make sure the times do not clash with an existing class of yours — a clash with a different centre is not something this screen can show you.

📸 [Screenshot: the My Centers page — the affiliations table with collaboration requests below it in both states]

### Page: My Classes

**Purpose, and when you use it**
Where the class itself is managed: who is in it, what its schedule is, and where its sessions are — and where you create your own group, postpone a lesson or cancel one.

**How to get there**
Sidebar → **"My Classes"**.

**Components, section by section**

1. **Your class list** — pick one and its detail opens. With no classes you read: "No classes assigned yet."
2. **The "Create group" button** — for your own group (steps in [2.9](#29-path-b-and-pricing-creating-your-own-group)).
3. **The class header** — subject, room (or **"TBD"**), schedule days, and a count of **"students"**.
4. **The unpriced-class notice** — if shown: "This class has no monthly or per-session price yet — students cannot subscribe until the center sets one."
5. **The class roster** — with nobody enrolled you read: "No students enrolled."
6. **The sessions table** — with "Date", "Status" and "Actions" columns. Statuses: **"Scheduled"** · **"Completed"** · **"Postponed"** · **"Cancelled"**. Each session has a **"Mark attendance"** button that takes you to the attendance screen, plus **"Postpone"** and **"Dismiss"** (cancel) actions. With no sessions you read: "No sessions yet."

**Actions, step by step**

*a) Postponing a lesson:*

1. In the sessions table press **"Postpone"** on the lesson.
2. Choose the new **"Date"**.
3. Choose the new **"Start"** and **"End"**.
4. Write the **"Reason"** — students and parents will read it, so write something understandable, not a single word.
5. Press **"Postpone"** to confirm, or **"Cancel"** to leave without changes.

*b) Cancelling a lesson:*

1. Press the cancel action on the lesson.
2. Write the **"Reason"**.
3. Confirm.

⚠️ **Careful:** a cancelled lesson **is never distributed** ("The lesson is cancelled, so there is nothing to distribute"). So if you actually taught the lesson, do not cancel it — take attendance and close it. Cancellation is for a lesson that **did not happen**.

*c) Going to attendance:* press **"Mark attendance"** on the lesson and continue on the "Attendance" screen below.

**Edge cases and expected errors**

- **"Failed to load classes":** a temporary interruption — reload.
- **No sessions showing for a new class:** sessions are generated from the days and the start and end dates; if the start date is in the future, the schedule begins there.
- **An unpriced class:** no subscriptions, no collection, no closing — top priority.

💡 **Tip:** postponing always beats cancelling when you intend to make the lesson up; postponing moves the lesson with its schedule and it stays closable and collectable, whereas cancelling ends it.

📸 [Screenshot: an open class — its header, roster and sessions table with the postpone and cancel actions]
📸 [Screenshot: the postpone dialog with the date, time and reason fields]

### Page: Attendance

**Purpose, and when you use it**
**The most important screen of your day.** It is where you record attendance, and where you close the lesson so your money lands. Use it **inside the classroom** — it is the only screen that works properly **with no internet**.

**How to get there**
Sidebar → **"Attendance"**, or via the "Mark attendance" button in "My Classes".

**Components, section by section**

1. **The "Take attendance" card**, subtitled **"Last 14 days"** — your recent lessons with "Date" and "Status" columns and a **"Mark attendance"** button on each row. With none: "No recent sessions to mark."
2. **The single-lesson screen** — headed "Attendance — {date} · {from}–{to}", containing:
   - A **"Back"** button.
   - **"Session Composition"** — a summary of how attendance breaks down for this lesson.
   - **The student list** with columns: "Student" (name and email) · "Status" · "Tag".
   - **Status buttons per student:** **"Present"** · **"Absent"** · **"Excused"**. ("Present" is the default.)
   - A **"Save attendance"** button.
   - **The "Close the lesson and distribute it" card** below the list ([3.4](#34-the-close-the-lesson-and-distribute-it-card)).
3. **The sync bar** — appears when changes have not been sent: **"{n} changes pending sync"** and a **"Sync now"** button.

**Actions, step by step**

*a) Recording attendance for a lesson:*

1. From "Last 14 days" press **"Mark attendance"** on the lesson.
2. Review the list: every student is **"Present"** by default.
3. Press **"Absent"** for everyone who did not attend, and **"Excused"** for anyone with an excuse.
4. Press **"Save attendance"**.
5. Wait for **"Attendance saved"**. If instead you see **"Saved offline — will sync when you're back online"**, the save is sound and local ([section 7](#7-working-offline-and-installing-the-app)).
6. Scroll to the closing card and follow [3.4](#34-the-close-the-lesson-and-distribute-it-card).

*b) Handling a student tagged "At center — didn't attend class":*
This tag appears in "Counter + door" mode for someone who passed the counter and was not confirmed at the door, and **it does not count as present in the distribution**.

1. Check for yourself: are they in the room right now?
2. If they are, press **"Present"** — corrected, and counted in the distribution.
3. If they are not, press **"Absent"**.
4. Press **"Save attendance"**.

⚠️ **Careful:** do not close the lesson while students still carry that tag unresolved; closing excludes them from the revenue permanently, and the distribution cannot be undone.

*c) A lesson locked for editing:*
If you see **"Editing closed — Attendance for this session is locked and can no longer be edited"**, attendance is final. Go to the centre or support for any correction, and do not try to save again.

**Edge cases and expected errors**

- **"Failed to save attendance":** nothing was recorded — retry. If it repeats, check your connection; with no connection it saves locally instead of failing.
- **"No students enrolled.":** nobody has paid for this class yet (or the class is unpriced). Do not expect them to appear at closing.
- **After "Sync now":** either "{n} changes synced", or "Nothing to sync", or "Still offline — will retry automatically", and possibly "{n} skipped" — skipping means the server holds a newer value for that lesson.

💡 **Tip:** the order that never goes wrong: **save attendance → read "Students present" on the closing card → close.** Never close before saving, because the card reads the saved values, not what is displayed.

📸 [Screenshot: a lesson roster with a student tagged "At center — didn't attend class" and the correction buttons]
📸 [Screenshot: the "{n} changes pending sync" bar and the "Sync now" button]

### Page: Gradebook

**Purpose, and when you use it**
You create assessments (exam, homework, oral…) and enter grades for the whole class on one screen, then read the distribution and averages.

**How to get there**
Sidebar → **"Gradebook"**.

**Components, section by section**

1. **"Course"** — the class picker. **Nothing shows until a class is chosen.** With no classes: "No classes assigned yet."
2. **The "Gradebook" card** — a grid: one row per student, one column per assessment. An empty cell reads **"Not graded"**, and the last column is **"Avg"**.
3. **Action buttons:** **"Create Assignment"** · **"Save Grades"** · **"Discard"**.
4. **The charts:** **"Score Distribution"** and **"Completion by Assignment"** (with "Completion %"); with no data: "No completion data yet."
5. With no assessments yet: **"No grade entries yet. Create an assignment to get started."**

**Actions, step by step**

*a) Creating an assessment:*

1. Pick the class from **"Course"** first (the button does nothing without one).
2. Press **"Create Assignment"**.
3. Enter the **"Assignment name"** — the on-screen example is "e.g. Midterm Exam". Make it distinctive; it becomes a column heading.
4. Choose the **"Grade type"**: **"Numeric"** or **"Grade band"**.
5. If you chose "Numeric", enter the **"Max score"** (at least 1; the default is 100). "Grade band" does not need it.
6. Choose the **"Date"**.
7. Press **"Create"**. You will see "Assignment created: '{name}'", and a new column appears.

*b) Entering grades:*

1. Pick the class.
2. Type each student's score into the right column's cell.
3. Skim what you typed — **the whole column is saved together**.
4. Press **"Save Grades"**, or **"Discard"** to throw away unsaved edits.

⚠️ **Careful:** **"Discard"** wipes everything you typed and have not saved, with no confirmation prompt. Do not press it after fifteen minutes of entry.

*c) Reading the result:*

1. Check each student's **"Avg"**.
2. Read **"Score Distribution"** to see the shape of the class rather than individuals.
3. Read **"Completion by Assignment"** to see which assessment is not fully entered.

**Edge cases and expected errors**

- **"Failed to create assignment":** check the fields ("Please enter a name"; "Please select a date"; for numeric, "Please enter a max score").
- **A new student not showing in the grid:** the grid reads the class roster; anyone not yet registered will not appear.
- **"Not graded" still showing after saving:** that cell was not saved — re-enter it and save.

💡 **Tip:** fix a naming convention in month one ("Month 1 Exam", "Homework 3") — column names are what a parent reads in their portal, and renaming them later confuses them.

📸 [Screenshot: the gradebook with two assessment columns, the "Avg" column and "Not graded" cells]
📸 [Screenshot: the "Create Assignment" dialog with its four fields]

### Page: Reviews

**Purpose, and when you use it**
Your reputation on the platform, as a parent sees it before subscribing for their child. A **read-only** page — you add nothing, edit nothing and hide nothing. Open it weekly, not daily.

**How to get there**
Sidebar → **"Reviews"**.

**Components, section by section**

1. **Three numbers:** **"Average Rating"** · **"Total Reviews"** · **"5-Star Reviews"**.
2. **The "Reviews" table** with columns: "Student" · "Rating" · "Comment" · "Date". An empty comment shows **"No comment"**, and the student may appear as **"Anonymous"**.
3. With none: **"No reviews yet."**

**Actions, step by step**

*A useful weekly read:*

1. Read **"Average Rating"** and **"Total Reviews"** together — an average built on two reviews means nothing.
2. Read the comments in date order, and look for **the recurring complaint** rather than the loudest one.
3. If one complaint recurs from several students in a single class, open "Messages" and reach out to that class's parents.

**Edge cases and expected errors**

- **"Anonymous":** the review was left without revealing the name. You cannot identify the author, nor reply from here.
- **A review you consider unfair:** there is no delete or appeal button on this screen — deliberately, since a review a teacher can erase is worthless to the reader. For abusive cases use **"Report"** from "Messages", or contact support.
- **The page is empty although you have many students:** reviewing is optional for the student.

💡 **Tip:** the best moment to ask for a review in person is right after a good exam result is announced, not at the end of term.

📸 [Screenshot: the Reviews page — the three numbers and a table with one commented review and one "Anonymous"]

### Page: Materials

**Purpose, and when you use it**
Your class's file library: notes, homework, exams. Upload here and it reaches that class's students only.

**How to get there**
Sidebar → **"Materials"**.

**Components, section by section**

1. **"Filter by course"** — to show one class's materials.
2. **The materials table** with columns: "Title" · "Type" · "Size" · "Uploaded" · "Source", plus **"Download"** and a delete action per row. With none: **"No materials found."**
3. **The "Upload Material" button**, whose dialog holds: **"Select course"** · **"Title"** · **"Type"** · and the file method.
4. **The "PDF storage" note:** "Upload stores PDFs in Cloudinary. If storage is not configured yet, choose PDF link and paste a shared PDF URL as a temporary workaround."

**Actions, step by step**

*a) Uploading a PDF:*

1. Press **"Upload Material"**.
2. Pick the class from **"Select course"** (required: "Please select a course").
3. Enter the **"Title"** — the on-screen example is "e.g. Lecture 1 - Introduction".
4. Choose the **"Type"**: **"Lecture"** · **"Homework"** · **"Exam"** · **"Other"**.
5. Choose **"Upload PDF"**, then press **"Select PDF"** — the rule: **"File (PDF only, max 20MB)"**.
6. Press **"Upload"** and wait for **"Material uploaded"**.

*b) Uploading via a link (the alternative):*

1. In the same dialog choose **"PDF Link"**.
2. Paste a valid URL to a PDF file.
3. Press **"Upload"**.

*c) Downloading a material:* press **"Download"** on its row.

*d) Deleting a material:*

1. Press the delete icon on its row.
2. Confirm **"Delete this material?"**.
3. Wait for **"Material deleted"**.

⚠️ **Careful:** deleting removes the material from your students immediately, and there is no trash to recover it from. Keep your own copy before deleting.

**Edge cases and expected errors**

| Message | Cause | Fix |
|---|---|---|
| "Only PDF files are allowed" | An image, Word or PowerPoint file | Convert to PDF (Print → Save as PDF) |
| "(too large, max 20MB)" | The file exceeds the limit | Compress it, split it, or upload it as a link |
| "Please enter a valid URL" | The link is incomplete or not a file | Paste a direct URL ending in a PDF |
| "Failed to upload material" | Interruption or a storage problem | Retry; if it persists, use "PDF Link" |
| "Failed to download material" | The file is temporarily unavailable | Retry, and check the link still works |

💡 **Tip:** number your titles ("01 — …", "02 — …") because the student sees a list, not a folder sorted like yours.

📸 [Screenshot: the "Upload Material" dialog with its fields and both upload/link options]

### Page: Door Check-in

**Purpose, and when you use it**
**Used only in "Counter + door" mode.** At the classroom door you confirm whoever actually passed the counter, which marks them present. Usually **your assistant** runs it, and you are the fallback.

**How to get there**
Sidebar → **"Door Check-in"** — "Confirm counter-checked students at the classroom door."

**Components, section by section**

1. **The wrong-mode notice** — if your mode is "Counter only" you read: "Your attendance mode is 'counter only' — the counter check-in alone marks attendance; this screen is used in 'counter + door' mode."
2. **"Today's sessions"** — pick the lesson whose door you are standing at. With none: "No sessions today".
3. **"At the door"** — a box for the student's code (example: `G7K3M2QF`) and a **"Confirm"** button.
4. **"Scan card"** — "Scan the student's card … Point the camera at the QR square — it confirms as soon as it reads." (The button is absent if the browser does not support the camera; type the code instead.)
5. **"Roster"** — everyone who passed the counter, each with a **"Present"** tag if confirmed, a **"Confirm"** button, or a **"No counter check-in"** tag with the explanation "Cannot be confirmed at the door before passing the counter." With nobody: **"Nobody has passed the counter yet"**.

**Actions, step by step**

*a) Confirming with a typed code:*

1. Pick the lesson from **"Today's sessions"**.
2. Type the student's code into **"At the door"** (eight characters).
3. Press **"Confirm"**.
4. Wait for **"Door check-in confirmed — present"**.

*b) Confirming by scanning the card:*

1. Pick the lesson.
2. Press **"Scan card"** and allow the camera.
3. Point the camera at the QR square on the student's card — it counts immediately, with no button press.

*c) Confirming from the roster:* press **"Confirm"** next to the name.

**Edge cases and expected errors**

| Message | What it means | What to do |
|---|---|---|
| "Student code not found" | A wrong code, or a student who is not registered | Check it character by character (they are uppercase), or find them by name in the roster |
| "Student has not been checked in at the counter — door check-in requires the counter first" | Not registered at the counter (usually unpaid) | **Send them to the counter first.** Do not confirm them at the door by another route |
| "The camera could not be opened. Type the code instead." | Camera permission denied, or an unsupported browser (usually Safari/iPhone) | Type the code manually — exactly the same result |
| "Not recorded" / "Door check-in failed" | The confirmation was not written | Press **"Try again"** |
| "Couldn't load today's sessions." | An interruption | Reload |

⚠️ **Careful:** do not "tidy up" the roster by confirming everyone at the end of the lesson. Every confirmation means "this student entered the room", and it is what the financial distribution is built on after closing.

💡 **Tip:** the ordinary wired scanner most centres own works here with no setup — it types the code into the box for you.

📸 [Screenshot: the door screen — a chosen lesson, the code box, and a roster entry tagged "No counter check-in"]

### Page: Wallet

**Purpose, and when you use it**
Your money: what is owed, what you can withdraw, and where your requests stand. Its detailed steps are in [section 3](#3-how-you-get-paid) (3.5–3.7) and are not repeated.

**How to get there**
Sidebar → **"Wallet"**.

**Components, in one line**
Three numbers ("Wallet balance" · "Available to withdraw" · "Reserved by open requests") + the **"Withdraw earnings"** button + the **"Payout requests"** table + the **"Recent wallet transactions"** table.

**The fastest monthly check (3 steps)**

1. Read the three numbers; if "Available to withdraw" is below the balance, the difference is **reserved by an open request**, not missing.
2. Review **"Payout requests"**: for any **"Rejected"** row, read its **"Note"** column.
3. Review **"Recent wallet transactions"**: every lesson you closed has an entry. No entry = a lesson never closed, so go back to "Attendance".

⚠️ **Careful:** entries in this table **are never edited or deleted** — a correction is a new, opposite entry shown beside the original.

📸 [Screenshot: the Wallet — its three numbers and a "Pending" payout request]

### Page: Team

**Purpose, and when you use it**
You create and remove **assistant** accounts. Its purpose, as the screen describes it: "Assistants are the primary contact point for your students and parents — you step in on escalations only."

**How to get there**
Sidebar → **"Team"**.

**Components**
A list of your assistants with a remove action on each, and an **"Add assistant"** button. With none: **"No assistants yet"** — "Create assistant accounts so students and parents have a first line of contact."

**Actions, step by step**

*a) Adding an assistant:*

1. Press **"Add assistant"**.
2. Enter the **"Name"**.
3. Enter the **"Email"** — **check it carefully**, as the activation invite goes there.
4. Enter the **"Title (optional)"** — the on-screen example is "e.g. Grading assistant".
5. Press **"Create account"**.

**You are never asked for a password, and you never see one.** The note on screen: "The assistant sets their own password from an emailed invite link — you never see it." The assistant receives an invite link, opens it, sees **"Activate your account — Set your password to get started."**, and then **"Account activated!"**.

*b) Removing an assistant:*

1. Press **"Remove"** next to their name.
2. Read the confirmation: **"Remove assistant? — {name} will lose team access. Existing conversations are kept, but they can no longer be contacted by your students."**
3. Press **"Remove"**.

⚠️ **Careful:** removal **cuts their access immediately** and takes them out of the contact channels with your students. Past conversations are kept for the record. And if they run the door screen, arrange a replacement before removing them, not after.

**Edge cases and expected errors**

- **"Could not create the assistant account":** the most common cause is an email already in use — use another address that they own.
- **The assistant says the invite never arrived:** ask them to check their spam folder, then try again.
- **The assistant wants a password from you:** do not create one for them and never share yours — the link is the only route.

**What an assistant does on your behalf, and what they cannot** — see [section 5](#5-your-team-assistants).

📸 [Screenshot: the "Add assistant" dialog with the note that the assistant sets their own password]

### Page: Team Notes

**Purpose, and when you use it**
A to-do board between you and your assistants — **not a chat**: "add a note, mark it done or declined, and see who has read it." Use it for instructions that must be carried out and be seen to have been ("photocopy 30 sets of Sunday's exam").

**How to get there**
Sidebar → **"Team Notes"** (a compact version also sits on the dashboard).

**Components**
A **"Write a note for your team…"** box with an **"Add"** button; then note cards each showing their status (**"Open"** / **"Done"** / **"Declined"**) as "{status} — by {name}", the read line **"Read by {n}/{total}"** or **"No one has read this yet"**, and the actions **"Mark done"** · **"Decline"** · **"Reopen"** · **"Pin"**/**"Unpin"** and delete. With none: **"No notes yet — write the first one for your team."**

**Actions, step by step**

*a) Adding a note:* type the text → press **"Add"**. Pinned notes appear first.

*b) Changing the status:* press **"Mark done"** if it was carried out, **"Decline"** if it was decided against, or **"Reopen"** to return it to "Open". **Any team member can change the status**, and the note's author is notified when someone else changes theirs.

*c) Pinning:* press **"Pin"** for anything that must stay at the top.

*d) Deleting:* press delete and confirm **"Delete this note?"**.

**Edge cases**

- **"Read by 0/3":** nobody has opened the board. A note **is not an urgent alert** — for something urgent use "Messages".
- **Editing the text:** the author only. Others change the status, not the text.
- **"Decline" is not a delete:** the note stays visible with that status, deliberately, so the decision stays on the record.

💡 **Tip:** write the note as an action with a deadline ("Prepare Tuesday's attendance sheet before 4pm") — the read line and the status then become real information.

📸 [Screenshot: the notes board — a pinned note, a "Done" note, and a "Read by 2/3" line]

### Page: Messages

**Purpose, and when you use it**
Your official channel to students, parents, centres and your assistants — instead of your personal number, and with a stored record.

**How to get there**
Sidebar → **"Messages"**.

**Components**
Two tabs: **"Direct"** and **"Channels"**; a **"New conversation"** button with **"Search contacts…"** and **"Filter by role"** (groups: "Students" · "Parents" · "Assistants" · "Centers" · "Center staff" · "Platform"); a **"Type a message…"** box and a **"Send"** button, **"Online"**/**"Offline"** indicators and a typing indicator, a **"Load older messages"** button, and the **"Block"** and **"Report"** tools.

**Actions, step by step**

*a) Starting a conversation:*

1. Press **"New conversation"**.
2. Search by name, or use **"Filter by role"**.
3. Pick the person, type your message, press **"Send"**.

*b) Reporting a conversation:*

1. Open the conversation and press **"Report"**.
2. Choose from **"What is the problem?"**: "Harassment or bullying" · "Spam" · "Inappropriate content" · **"Child-safety concern"** · "Something else".
3. Add **"Details (optional)"** and press **"Send report"** → "Report sent. Platform staff will review it."

*c) Blocking:*

1. Press **"Block"**.
2. Read: "Block {name}? Neither of you will be able to send new messages. Your existing conversation is kept, and it stays visible to platform staff."
3. Confirm. To undo: **"Unblock"** from **"Blocked people"**.

**Edge cases and expected errors**

- **"No contacts available":** no relationship exists yet (no students in your classes, or no centre affiliation). The platform only allows messaging people you are connected to.
- **A student you cannot find:** they are not in any of your classes, or their account is not complete yet.
- **"You are sending messages too quickly. Please wait a moment."** — wait a few seconds and continue.
- **"Connection lost — reconnecting, messages will be sent once back online"** — do not retype the message.
- **"Failed to send"** — press **"Retry"**.
- **"You can no longer send messages in this conversation."** — a block from the other side, or an administrative restriction.
- **"Message removed"** — a message was withdrawn; its text remains in the platform's record.

⚠️ **Careful:** every conversation is **stored and visible to platform staff** when needed, and parents can read their minor children's chats with adults. This protects both sides — always write what would not harm you if read.

💡 **Tip:** point fee and timing questions at your assistant or the centre from day one; the screen is built around that ordering.

📸 [Screenshot: Messages — the conversation list, an open thread, and the "New conversation" button with role filtering]

### Page: Notifications

**Purpose, and when you use it**
Everything that happened and concerns you, in one place: a payment, an absence, a grade, a postponement, an invite. Open it in the morning and after your last lesson.

**How to get there**
Sidebar → **"Notifications"**.

**Components**
The page title with **"{n} unread"**, a **"Mark all read"** button, and the notification list with an **"Unread"** tag and a relative time ("just now" · "{n}m ago" · "{n}h ago" · "{n}d ago"). With none: **"No notifications yet"**.

**Types you see as a teacher:** "Payment recorded" · "Absence marked" · "Attendance corrected" · "Grade entered" / "Grade posted" · "Material uploaded" · "Session cancelled" / "Session postponed" · "Enrollment approved" / "Enrollment declined" · "Team note" / "Note status" · "Guardian email needed".

**Actions, step by step**

1. Open the page and read the unread count.
2. **Press the notification itself** — it takes you to the screen it concerns (the lesson, the class, the note).
3. Once reviewed, press **"Mark all read"**.

**Edge cases**

- **Notifications not reaching your phone:** enable browser notifications from "Settings" ([section 7](#7-working-offline-and-installing-the-app)).
- **"Guardian email needed":** this concerns a minor student with no guardian email; the action sits with the student or the centre rather than you, but the reminder is useful.

💡 "Mark all read" is not an achievement — read the money and absence notifications one by one, and clear the rest.

📸 [Screenshot: Notifications with the "Unread" tag and the "Mark all read" button]

### Page: Settings

**Purpose, and when you use it**
Your account, your security, and **attendance mode**. Visited once at the start, then when changing a password or losing a device.

**How to get there**
Sidebar → **"Settings"**.

**Components, section by section**

1. **"Attendance mode"** — the most important decision ([2.5](#25-the-most-important-setting-you-own-attendance-mode)).
2. **Teacher photo** ([2.4](#24-your-profile-photo)).
3. **Notifications** — browser notifications.
4. **"Two-factor authentication (2FA)"** ([2.6](#26-securing-your-account-five-minutes-once)).
5. **"Password"** ([2.6](#26-securing-your-account-five-minutes-once)).
6. **"Devices & sessions"** ([2.6](#26-securing-your-account-five-minutes-once)).
7. **The data-rights card** — request a copy of your data.

**The most important action when you lose your phone (in order):**

1. Open **"Devices & sessions"** and press **"Sign out all other devices"**.
2. Open **"Password"** and change it.
3. Review **"Two-factor authentication"** — if the authenticator app was on the lost phone, use a **backup code** to get in, then re-enrol on your new phone.

⚠️ **Careful:** changing your password signs you out of **every** device, including the one in front of you. Do not do it just before walking into a room with no internet.

💡 If you only ever use one fixed device, a second session in that list is information worth investigating, not ignoring.

📸 [Screenshot: the full Settings page in card order]

---

## 5. Your team: assistants

An assistant is not a reduced account — they are **your deputy**: they work with your permissions over your students, and everything they do remains attributed to you in the record.

### 5.1 The basic rule

**An assistant serves exactly one teacher** — never two. You, on the other hand, may have several assistants.

### 5.2 What your assistant can do on your behalf

- **Record attendance** and save it for all your lessons.
- **Door check-in** — their first reason for existing in "Counter + door" mode.
- **Close a lesson and distribute its revenue** — yes, they can, **and the revenue lands in your wallet**, with the action recorded in their name on your behalf.
- **Grades:** creating assessments, entering grades, saving them.
- **Materials:** uploading and deleting.
- **The schedule:** postponing and cancelling lessons.
- **Collaboration with centres:** sending requests and answering them.
- **Changing your attendance mode.**
- **Messages:** contacting your students and their parents — **under their own name**, not yours.
- **Team notes.**

### 5.3 What they cannot do — and cannot be granted

- **Your wallet:** they never see it and cannot request a payout from it. The money is yours alone.
- **Financial settings** and any figure concerning commission or centre shares.
- **Managing assistants:** they cannot add or remove an assistant — including themselves.
- **Your password** or your sessions.

⚠️ **Note the fine distinction:** your assistant can **close a lesson** (a financial act whose result is yours) but cannot **withdraw** from it. That is deliberate: closing is part of running the room; withdrawing is disposing of your money.

### 5.4 Accountability: who did what

Every action your assistant takes is recorded as **"assistant X on behalf of teacher Y"**. So when you ask "who closed Tuesday's lesson?", the answer exists under their name, rather than being attributed to you indistinguishably.

**One deliberate exception: messages.** An assistant messages a student **under their own identity**, so that nobody ever talks to a student while wearing someone else's name. Most of our students are minors, and that is a line that is not crossed.

### 5.5 What the assistant sees in their portal

Almost the same screens as yours, minus what they may not have: a dashboard, classes, attendance, door check-in, gradebook, materials, collaboration requests, messages, team notes, notifications, settings. **No wallet, and no team page.**

A missing capability is **entirely absent** from their screen — not visible and disabled. So if your assistant says "I can't see the wallet", that is the correct behaviour, not a fault.

### 5.6 A ten-minute handover recipe for a new assistant

1. Create their account from **"Team" → "Add assistant"**.
2. Confirm they activated it themselves from the emailed link and can sign in.
3. Stand them in front of the **"Attendance"** screen: how to record and save, and what "Saved offline" means.
4. If your mode is "Counter + door", train them on **"Door Check-in"** and on the correct response to "Student has not been checked in at the counter" → **to the counter, no other route.**
5. Agree explicitly: **do they close lessons, or do you?** Closing cannot be undone, so make it stated, not assumed.
6. Write the first note on **"Team Notes"** so you see the "Read by 1/1" line.

⚠️ **When your relationship with an assistant ends, remove them from "Team" the same day.** While the account stands, they can record attendance and close lessons in your name.

📸 [Screenshot: the assistant portal — its sidebar with no "Wallet" and no "Team"]

---

## 6. How-to recipes

> Every recipe starts from the **Dashboard**. Details and messages are in [section 4](#4-page-by-page-tour).

**1) Record attendance for a lesson**
Dashboard → "Attendance" → "Mark attendance" on the lesson → set "Present"/"Absent"/"Excused" → **"Save attendance"** → wait for "Attendance saved".

**2) Close a lesson and collect your dues** ⚠️ cannot be undone
"Attendance" → save attendance first → scroll to **"Close the lesson and distribute it"** → read "Students present" and "Teacher's total" → press the button carrying the amount → press **"Final confirmation — press to distribute"** → wait for "Lesson closed and its revenue distributed".

**3) Correct a student tagged "At center — didn't attend class"**
"Attendance" → open the lesson → next to their name press **"Present"** if they are in the room or **"Absent"** if not → "Save attendance" → **then** close the lesson.

**4) Door check-in for a student**
"Door Check-in" → pick the lesson from "Today's sessions" → type the student's code into "At the door" → **"Confirm"** → wait for "Door check-in confirmed — present". (Or **"Scan card"** with the camera.)

**5) Create an assessment**
"Gradebook" → pick the class from "Course" → **"Create Assignment"** → "Assignment name" + "Grade type" + "Max score" + "Date" → **"Create"**.

**6) Enter and save grades**
"Gradebook" → pick the class → type scores into the assessment column → review → **"Save Grades"**. (⚠️ "Discard" wipes unsaved work with no confirmation.)

**7) Upload a PDF**
"Materials" → **"Upload Material"** → "Select course" → "Title" → "Type" → "Upload PDF" → pick the file (≤ 20MB) → **"Upload"**.

**8) Upload a material by link instead of a file**
Same route, but choose **"PDF Link"** and paste a direct URL to a PDF → "Upload".

**9) Delete a material** ⚠️ no trash
"Materials" → the delete icon on its row → confirm "Delete this material?".

**10) Create your own group**
"My Classes" → **"Create group"** → name + subject + grade + location + days + times + start and end dates + max students + **at least one price** → "Create group".

**11) Apply to teach at a centre**
"My Centers" → **"Apply to teach at a center"** → pick the centre, subject, grade and hall → days, times and start date → **"Send request"**.

**12) Answer an incoming collaboration request** ⚠️ accepting creates the class and schedule immediately
"My Centers" → find the row tagged **"Incoming — your decision"** → review "Schedule" and "Center share" → **"Accept"** (and choose the pricing method if asked) or **"Decline"** → **then check the class pricing**.

**13) Postpone a lesson**
"My Classes" → open the class → "Postpone" on the lesson → new date, start and end → write the "Reason" → **"Postpone"**.

**14) Cancel a lesson** ⚠️ a cancelled lesson is never distributed
"My Classes" → the cancel action on the lesson → write the "Reason" → confirm. (If you actually taught it, take attendance and close it instead.)

**15) Request a payout of your earnings**
"Wallet" → read "Available to withdraw" → **"Withdraw earnings"** → type an amount or leave it empty for everything → **"Request payout"** → track "Status" in "Payout requests".

**16) Invite an assistant**
"Team" → **"Add assistant"** → name + email + title (optional) → **"Create account"** → ask them to open the link in their email and set their own password.

**17) Remove an assistant** ⚠️ access is lost immediately
"Team" → "Remove" next to their name → read the confirmation → "Remove". Arrange a replacement for the door screen first.

**18) Message a student or parent**
"Messages" → **"New conversation"** → search by name or use "Filter by role" → type → **"Send"**.

**19) Report an abusive conversation**
"Messages" → open the thread → **"Report"** → pick the reason ("Harassment or bullying" / "Spam" / "Inappropriate content" / "Child-safety concern") → "Send report".

**20) Change your attendance mode** ⚠️ changes how your team works
"Settings" → **"Attendance mode"** → pick the mode → wait for "Attendance mode saved".

**21) Secure your account after losing your phone**
"Settings" → "Devices & sessions" → **"Sign out all other devices"** → then "Password" → change it → then re-enrol **2FA** on your new phone using a backup code.

**22) The monthly dues check**
"Attendance" → confirm no old lesson is left unclosed → "Wallet" → review the three numbers → request a payout of what is available.

---

## 7. Working offline and installing the app

Classrooms in centres are often in a basement or behind concrete walls, and the attendance screen was built on that assumption.

### 7.1 Installing the platform onto your home screen

**There is no app on the App Store or Google Play.** You install from the browser itself:

**On Android (Chrome):**

1. Open the platform and sign in.
2. A prompt appears: **"Install Edura — Add Edura to your home screen for faster access and offline support."**
3. Press **"Install"**. (If you dismissed it with **"Not now"**, open the browser menu → "Install app".)

**On iPhone (Safari):** the prompt explains it itself: **"Tap Share, then 'Add to Home Screen' to install Edura."**

**Why it is worth doing:** an icon on your home screen, a faster launch, a screen with no address bar, **and notifications on your phone**.

⚠️ **A note for iPhone users:** the camera scanner in "Door Check-in" may not work in Safari. The "Scan card" button simply will not appear, **and typing the code always works** — so no capability is lost.

### 7.2 Taking attendance with no internet

1. **Open the attendance screen while you still have internet** — before entering the room, so the roster loads.
2. Record attendance as usual and press **"Save attendance"**.
3. With no network you will see: **"Saved offline — will sync when you're back online"**. **This is success**, not a warning: your record is stored on your device.
4. A bar appears: **"{n} changes pending sync"**.
5. When the network returns they are sent automatically, or press **"Sync now"** to hurry it.
6. Wait for one of: **"{n} changes synced"**, **"Nothing to sync"**, or **"Still offline — will retry automatically"**.

**About "{n} skipped":** it means the server holds a **newer** value for that lesson (your assistant or the counter recorded it after your local save), so the older one did not overwrite it. **Open the lesson and check its roster before closing.**

### 7.3 What does not work offline

| Works | Does not work |
|---|---|
| Recording attendance and saving it locally | **Closing a lesson and distributing it** — a financial operation that needs the server |
| Reading screens loaded before the outage | Door check-in (it needs live verification) |
| Writing a message that sends on return ("Connection lost — reconnecting, messages will be sent once back online") | Uploading materials, saving grades, and payout requests |

⚠️ **Careful:** do not wait for attendance to sync in order to close the lesson. **The right order:** attendance locally in the room → get back to a network → confirm the sync bar has gone → open the lesson → read "Students present" → close. Closing a lesson whose attendance has not synced distributes over the old count — and the distribution cannot be undone.

💡 **Tip:** never sign out of the platform on your teaching phone while out of coverage; **signing out clears locally stored data**, including attendance that has not synced.

📸 [Screenshot: the "Install Edura" prompt]
📸 [Screenshot: the "Saved offline" message with the sync bar]

---

## 8. FAQ and troubleshooting

### First: signing in and your account

**1) I signed up and cannot sign in; the message says "Your account is still under review by the Edura team".**
This is correct behaviour, not an error. Teacher accounts are reviewed before activation. **Do not create a second account** — yours is fine and waiting. If it drags on, contact support with the exact address you signed up with.

**2) The message says "Your account is currently inactive. Contact support or your center to reactivate it."**
This is entirely different from the first: your account was active and has been deactivated. Go to support or the centre — changing your password or creating a new account will not help.

**3) The message says "Too many attempts — please wait a moment and try again."**
This is guessing protection. Wait a few minutes then try **once**, carefully; rapid retries extend the wait. If you are unsure of your password, use "Forgot password?" instead of attempts.

**4) I forgot my password, or the reset link never arrived.**

1. Press **"Forgot password?"**, enter your email → **"Send reset link"**.
2. You will read: "If an account exists for {email}, we've sent a password reset link. **It expires in 1 hour**."
3. Nothing arrived? Check spam, confirm the address is spelled exactly, **and note: the same message appears even if the address is not registered** (a privacy protection) — so you may have signed up with a different one.
4. More than an hour has passed? Ask for a **"Request new link"**.

**5) I lost the phone with the authenticator app (2FA).**
Use **"Use a backup code instead"** on the verification screen and enter one of the codes you saved (each works once). Once in: **"Devices & sessions" → "Sign out all other devices"**, then re-enrol 2FA on your new phone. **No backup codes saved?** Support is your only route.

### Second: money — the most frequent questions

**6) I taught many lessons and my wallet is empty. Where is my money?**
In nine out of ten cases: **your lessons were never closed.** A student's payment does not credit your share; closing does ([3.3](#33-the-decisive-rule-no-money-before-the-lesson-is-closed)).

1. Open **"Attendance"** and review "Last 14 days".
2. For every lesson you taught: confirm attendance is saved, then scroll to the closing card and complete it.
3. If the closing card **shows no button**, it is showing the reason in words — read it and follow the table in [3.4](#34-the-close-the-lesson-and-distribute-it-card).
4. **Exception:** your own group (no centre) distributes **at payment time**, not on closing — check "Recent wallet transactions".

**7) The closing card says: "This class has no price, so the lesson would distribute nothing."**
The class is unpriced, which also means **your students cannot subscribe to it**. Classes created by accepting a collaboration always start this way. The fix: price the class (monthly and/or per-session) — by the centre if it is inside a centre, or by you in your own group. **Do not close it before pricing**, and the platform's refusal here protects you: closing at zero cannot be undone.

**8) A student was present and was not counted in my share.**
Check their row in the attendance list:

- Tagged **"At center — didn't attend class"** → they passed the counter and were not confirmed at the door, so they do not count. Press **"Present"** → "Save attendance" → **then** close.
- **Already closed** ("Editing closed" or "This lesson was already closed…") → the distribution cannot be edited; the ledger is never modified. Go to the centre or support for a correction by an opposite entry.

**9) A student says they paid and I cannot find them in the class roster.**
Ask them for the **receipt number**, or the date and place of payment, then:

1. Confirm you are in **the right class** (same subject, grade and time) — paying for a different group is common.
2. Confirm the class is **priced**; an unpriced one cannot be subscribed to at all.
3. If it was a cash payment, its record is at the **counter** — go to them with the receipt.
4. Do not let them into a lesson "on account" and do not mark them present to smooth it over; that distorts the distribution.

**10) "Available to withdraw" is lower than "Wallet balance". Has some of it been lost?**
No. The difference is **"Reserved by open requests"** — an open payout request not yet paid. Open "Payout requests" and you will find it as "Pending" or "Approved". Available is zero? The message itself explains: "Nothing available — funds are reserved by open requests or the balance is empty."

**11) My payout request status is "Rejected".**
**Read the "Note" column** in the same row — the reason is written there. The amount returns to "Available to withdraw" and you can submit a new request once the cause is addressed.

**12) There is a negative amount in "Recent wallet transactions".**
That is a **"Refund"** entry: a student's payment was refunded after it had been credited. The original entry **is not erased** — its reversal appears beside it. The ledger recounts what happened in full; it is not an arithmetic error.

**13) Do I owe Edura a monthly subscription?**
No. There is no plan and no invoice for a teacher. Income comes from your students, with **the platform's share** and **the centre's or hall's share** deducted, and the rest is yours — and all three figures appear in front of you before every closing.

⚠️ [Needs confirmation from the team: is there a plan to move the teacher role to a paid-subscription model later?]

### Third: attendance, the door, and materials

**14) On the door screen: "Student has not been checked in at the counter — door check-in requires the counter first".**
They were not registered at the counter (usually because they have not paid). **Send them to the counter**; there is no other route and there should not be — that ordering is what keeps collection and attendance in agreement.

**15) The camera will not open for scanning: "The camera could not be opened. Type the code instead."**
Grant the site camera permission, or use Chrome on Android. **In every case: type the code manually** — exactly the same result, and the centre's wired scanner works with no setup.

**16) Material upload problems.**
"Only PDF files are allowed" → convert to PDF. "(too large, max 20MB)" → compress it, split it, or use **"PDF Link"**. "Failed to upload material" → retry, then use the link as a temporary workaround.

**17) After syncing I saw "{n} skipped" — has my attendance been lost?**
No. The server holds a **newer** value for that lesson (your assistant or the counter recorded it after your local save), so the older one did not overwrite it. **Open the lesson and review its roster before closing.**

**18) A new student is not showing in "Gradebook".**
The grid reads registered class students. If they have only just paid, refresh the page; if they still do not appear, they are not in this class.

**19) "No contacts available" in Messages.**
Messaging is limited to an existing relationship: your students, their parents, your centre, your assistants. No students and no affiliation yet = no contacts. This is protection, not a gap.

---

## 9. Glossary

| Term | What it means in Edura |
|---|---|
| **Class / group** | The unit you teach: subject + grade + schedule + price. Its sessions are generated from it. |
| **Lesson (session)** | A single meeting with a date and time. Statuses: "Scheduled" · "Completed" · "Postponed" · "Cancelled". |
| **Closing a lesson** | Your declaration that the lesson happened, which is what **distributes its revenue** and credits your share. It cannot be undone. |
| **Distribution** | Splitting the lesson price: platform share + centre/hall share + the remainder to you. |
| **The ledger** | The record of financial entries. **Never edited, never deleted**; a correction is a new, opposite entry. |
| **Ref** | A financial entry's number. Quote it in any query. |
| **Wallet** | Your account on the platform: "Wallet balance", "Available to withdraw" and "Reserved by open requests". |
| **Payout request** | Your request to be paid your earnings. Statuses: "Pending" → "Approved" → "Paid", or "Rejected". |
| **Refund** | The reversal of an earlier payment; it appears as an opposite entry and does not erase the original. |
| **Affiliation** | Your relationship with a centre. Statuses: "Active" · "Pending" · "Declined" · "Expired" · "Removed". |
| **Collaboration request** | A request between you and a centre to open a class. **Accepting creates the class and schedule immediately.** |
| **Centre / hall share** | The centre's cut. Computed either as "Whole-room percentage", "Per attending student", or a fixed affiliation share — **and set by the platform.** |
| **"Per attending student"** | Hall pricing based on who actually attends; there is no fixed lesson price in advance. |
| **The counter** | The centre's front desk: it collects money and records the first check-in. |
| **Door check-in** | A second confirmation at the classroom door, **in "Counter + door" mode only**. |
| **"At center — didn't attend class"** | Passed the counter, not confirmed at the door. **Does not count as present and does not enter the distribution.** |
| **Attendance mode** | Your setting: "Counter only" or "Counter + door". |
| **Teacher-direct group** | Your own group, with no centre. Its revenue is distributed **at payment time**. |
| **Assessment** | A grade column (exam/homework) with a name, a max score and a date. |
| **Assistant** | Your deputy, with your permissions over your students, but no wallet and no assistant management. Serves one teacher. |
| **Team notes** | A to-do board between you and your assistants, with a status and a "Read by n/total" line. Not a chat. |
| **Backup code** | A single-use code that gets you in when you lose your authenticator app. |
| **PWA / installing the app** | Adding the platform to your phone's home screen from the browser. There is no app in the stores. |

---

## 10. Checklists, and what the team must confirm

### 10.1 Your first-time setup checklist (in order)

- [ ] Created the account and chose **"Teacher"**
- [ ] Approval arrived and you signed in successfully
- [ ] Completed the **grades → subjects** wizard ("Your profile has been saved!")
- [ ] Uploaded your profile photo
- [ ] **Decided your "Attendance mode"** — and you have someone on the door if you chose "Counter + door"
- [ ] Enabled **2FA** and stored the backup codes **away from** your phone
- [ ] Reviewed **"Devices & sessions"**
- [ ] Enabled browser notifications and **installed** the platform on your phone's home screen
- [ ] You have a centre ("Active") or a group of your own that you created
- [ ] **Every one of your classes is priced** — no "This class has no monthly or per-session price yet…" notice
- [ ] Created an assistant (if you need one) and they activated the account themselves, **and you agreed who closes lessons**
- [ ] Closed your first lesson successfully and saw the entry in "Recent wallet transactions"

### 10.2 The routine

**After every lesson:** save attendance → read "Students present" → close the lesson.
**Weekly:** "Pending Grades" = zero · review "Reviews" · clear unread messages.
**Monthly:** no old lesson left unclosed · review the wallet's three numbers · request a payout of what is available.

### 10.3 Actions that cannot be undone

1. **Closing a lesson and distributing it** — "The distribution is written to the ledger once, and cannot be undone."
2. **Cancelling a lesson** — a cancelled lesson is never distributed.
3. **Deleting a material** — there is no trash.
4. **"Discard"** in the gradebook — wipes unsaved work with no confirmation.
5. **Removing an assistant** — access is lost immediately.
6. **Changing your password** — signs you out of every device, including your own.
7. **Signing out on your teaching phone** — clears locally stored attendance that has not synced.
8. **Accepting a collaboration request** — creates the class and its full session schedule immediately.

### 10.4 Open items for the team

| # | Question | Where it appears |
|---|---|---|
| 1 | The expected review time for a teacher account, and the **official support channel** (email / WhatsApp / phone) — the guide points to it in five places | 2.2 · 8 |
| 2 | Is an **email** sent when an account is approved, or only an in-platform notification? (the on-screen copy promises a notification) | 2.2 |
| 3 | Can a teacher **edit the price of a class created by accepting a collaboration**, or is pricing the centre's right alone? (the on-screen copy attributes it to the centre) | 2.9 · 3.4 · 8-7 |
| 4 | Which **online payment methods** are available to students at launch, and is the gateway in test or live mode | 3.1 |
| 5 | The **payout method for a teacher** (bank transfer / mobile wallet / cash from the centre), **where they record those details**, the time between "Approved" and "Paid", and whether there is a minimum payout | 3.6 |
| 6 | Is there a plan to move the teacher role to a **paid-subscription model** later? | 8-13 |

**Editorial decisions taken, which need sign-off:**

7. **No percentage or money figure is published** anywhere in this guide (neither the platform's percentage nor the flat fee), because those values can be changed from the back office, which would make any printed number a lie. The guide always points to what appears on screen before closing. **If you want the figures published, that is two added lines in 3.2.**
8. **The "Subscription and billing" section** required by the original template was replaced by section 3 ("How you get paid"), because the platform collects nothing from a teacher — no plans, no invoices, no renewals.
9. **The assistant portal was not toured page by page** (section 5 covers their permissions and limits only). A standalone assistant guide is separate work.
10. **30 screenshots are required** — every 📸 marker carries a description of what to capture. Best taken from a demo teacher account holding realistic data (two classes, students, one closed lesson and one unpriced) in the interface language of each guide.
11. **Missing links:** the guide refers to "Terms of Service" and "Privacy Policy" as they appear on the sign-up screen; if final URLs exist, add them in section 0.
