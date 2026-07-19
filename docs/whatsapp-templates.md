# WhatsApp templates (for Meta approval)

Source of truth: `apps/www/src/lib/services/whatsapp/templates.ts`. Submit each
template in **both** languages under the exact names below (category: UTILITY).
Until the business number is verified and templates approved, run
`WHATSAPP_MODE=mock` (the default) — the mock driver renders these bodies
locally and every attempt is logged to `whatsapp_messages`.

## edura_walk_in_welcome
Sent right after a center registers a walk-in student. Params:
`{{1}}` student name · `{{2}}` student code (STU-xxxxxx) · `{{3}}` secure one-time onboarding link.

- **ar**: مرحبًا {{1}}! تم إنشاء حسابك على منصة إدورا. كود الطالب الخاص بك هو {{2}} — احتفظ به لتسجيل الحضور في السنتر. لإكمال تسجيلك (السنة الدراسية والشعبة) افتح الرابط: {{3}}
- **en**: Hi {{1}}! Your Edura account has been created. Your student code is {{2}} — keep it for center check-in. Complete your registration (academic year & track) here: {{3}}

## edura_student_code_reminder
Sent when a walk-in registration matches an existing account by phone
(duplicate handling — no new account is created). Params:
`{{1}}` student name · `{{2}}` student code.

- **ar**: مرحبًا {{1}}! تذكير من إدورا: كود الطالب الخاص بك هو {{2}} — استخدمه لتسجيل الحضور في السنتر.
- **en**: Hi {{1}}! Edura reminder: your student code is {{2}} — use it for center check-in.

## Environment

| Var | Default | Meaning |
| --- | --- | --- |
| `WHATSAPP_MODE` | `mock` | `mock` = local, no credentials; `live` = Meta Cloud API |
| `WHATSAPP_TOKEN` | — | Cloud API bearer token (live only) |
| `WHATSAPP_PHONE_ID` | — | Cloud API phone-number id (live only) |
| `WHATSAPP_API_VERSION` | `v20.0` | Graph API version |
| `WALKIN_TOKEN_TTL_HOURS` | `168` | Onboarding-link lifetime (7 days) |

A future OTP / phone-verification flow is one more UTILITY (AUTHENTICATION)
template + call site on the same driver interface — deliberately out of scope
this phase.
