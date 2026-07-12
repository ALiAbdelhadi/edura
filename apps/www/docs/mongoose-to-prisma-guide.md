# Mongoose → Prisma/Neon conversion guide (Edura API routes)

Every API route + service is being moved off Mongoose onto the Neon Postgres
layer in `@repo/database`. Follow this guide EXACTLY so all modules are
consistent. The canonical reference is the already-converted `rooms` module:
`app/api/v1/rooms/route.ts` and `app/api/v1/rooms/[id]/route.ts`.

## Golden rules

1. **All DB access goes through `scopedDb`** (`@/lib/db/scope`):
   ```ts
   import { scopedDb } from "@/lib/db/scope";
   const data = await scopedDb(user, (tx) => tx.model.findMany({ where }));
   ```
   `scopedDb(user, fn)` runs `fn` under the correct Row-Level-Security context:
   - `center_admin` → `withTenant(centerId)` (RLS enforces center isolation).
   - super_admin / accountant / teacher / student / parent / **public** → platform
     context. For these you MUST keep the existing ownership filters
     (`teacherId`/`studentId`/`parentId`/`userId` = `user.id`) — RLS does not
     scope them.
   - For truly public/unauthenticated reads (search/discovery, public center or
     teacher profile), use `platformDb((tx) => …)` from `@/lib/db/scope` with no
     user.
   `tx` is the Prisma client — use `tx.course`, `tx.attendanceRecord`,
   `tx.centerTeacherAffiliation`, `tx.gradeScore`, etc.

2. **Keep external side effects OUTSIDE `scopedDb`** — `fn` runs inside a DB
   transaction. Do DB work in `fn`, return data, THEN send email/FCM/notify.
   (Calling a notify service that itself writes the DB is fine — it opens its
   own context; just call it after the main `scopedDb` returns.)

2b. **NEVER nest `scopedDb`/`platformDb`.** They open an interactive DB
   transaction; opening another inside the callback deadlocks/throws. Services
   that both write data AND notify must do ALL DB work in a single `scopedDb`
   block, return what's needed, then call `notify(...)`/FCM AFTER the block:
   ```ts
   export async function recordPayment(data, user) {
     const { payment, recipients } = await scopedDb(user, async (tx) => {
       // validations (tx reads) + tx.payment.create(...) + wallet updates
       return { payment, recipients };
     });
     await notify(recipients, …); // side effects AFTER the tx closes
     return payment;
   }
   ```
   Do not call another service that touches the DB from inside a `scopedDb`
   callback. The thin route usually needs no change — convert the SERVICE.

3. **Do NOT delete any Mongoose model file or `lib/db/connect.ts`.** Other,
   not-yet-converted modules still import them. Cleanup happens later, centrally.
   Just stop importing them from the files you convert.

4. **Preserve the public contract**: exported service function names/signatures,
   route response shapes (the `ok()` envelope), status codes, zod schemas, and
   `requireRole(...)` / `requireCenterScope(...)` guards stay the same. You are
   changing the DB layer underneath, not the API behavior.

5. **Read the Prisma model** in `packages/database/prisma/schema.prisma` for the
   exact field names before converting a model's queries. Prisma model accessors
   and fields are camelCase (`prisma.attendanceRecord`, `enrolledBy`, `centerId`).

## Query translation

| Mongoose | Prisma |
|---|---|
| `await connectDB(); Model.find(f).lean()` | `scopedDb(user, tx => tx.model.findMany({ where: f }))` |
| `Model.findById(id).lean()` | `tx.model.findUnique({ where: { id } })` |
| `Model.findOne(f).lean()` | `tx.model.findFirst({ where: f })` |
| `Model.create({...})` | `tx.model.create({ data: {...} })` |
| `Model.findByIdAndUpdate(id, {$set: b}, {new:true})` | `tx.model.update({ where: { id }, data: b })` |
| `Model.findByIdAndDelete(id)` | `tx.model.delete({ where: { id } })` |
| `Model.updateMany(f, {$set:b})` | `tx.model.updateMany({ where: f, data: b })` |
| `Model.countDocuments(f)` | `tx.model.count({ where: f })` |
| `Model.aggregate([{$match},{$group}])` | `tx.model.groupBy({ by, where, _count/_sum })` or `tx.$queryRaw` for complex cases |
| `.populate("x")` | `include: { x: true }` **only if a Prisma relation exists**; otherwise do a second `findMany({ where: { id: { in } } })` and build a Map (see `courses`/`rooms` reference) |

Operators: `$in`→`in`, `$nin`→`notIn`, `$gte/$gt/$lte/$lt`→`gte/gt/lte/lt`,
`$ne`→`not`, `$or`→`OR`, `$and`→`AND`, `$set`→`data`, `$regex:/x/i`→
`contains: "x", mode: "insensitive"`, `$exists`→`not: null` / `null`.

## Field / model notes

- **`_id` → `id`** everywhere (string UUID). Drop `.lean()` and `.toObject()`.
  Refs that were ObjectId are now plain string columns (`centerId`, `teacherId`,
  `studentId`, `courseId`, …) — compare as strings, no `.toString()`.
- **Enums** are string literals with the SAME values (`"active"`, `"present"`,
  `"pending"`, …). No change needed.
- **Grade.scores** was an embedded array; it is now a related table
  `GradeScore`. Read with `include: { scores: true }`; create with
  `data: { …, scores: { create: [{ studentId, score }] } }`. To upsert a score,
  use `tx.gradeScore.upsert({ where: { gradeId_studentId: { gradeId, studentId } }, … })`.
- **Session has no `centerId`** — reach the center via its `course`
  (`include: { course: true }` then `course.centerId`), or filter sessions by
  `courseId in (course ids of the center)`.
- **MessageThread.unreadCounts** is `Json` (was a Map) — read/write as a plain
  object. **participantIds** is `String[]`; filter with `has`/`hasSome`.
- **Payment.amount** is signed piasters (refunds negative). **Expense.amount**
  positive. Keep money as integers.
- **Enrollment** active-uniqueness is `@@unique([studentId, courseId])` on the
  partial index — creating a duplicate active enrollment throws `P2002`; catch
  and map to the existing `ConflictError` where the old code did.
- Timestamps `createdAt`/`updatedAt` are managed by Prisma automatically — don't
  set them manually.

## Error handling

Keep using the existing error classes (`NotFoundError`, `ForbiddenError`,
`BusinessRuleError`, `ConflictError`) from `@/lib/errors/classes` and the
`withErrors` wrapper. Prisma unique-violation is `err.code === "P2002"`;
not-found on `update`/`delete` is `P2025` → map to `NotFoundError`.

## Checklist per file

- [ ] Remove `connectDB` + Mongoose model imports.
- [ ] Route DB access wrapped in `scopedDb(user, …)` (or `platformDb` for public).
- [ ] Ownership filters preserved for teacher/student/parent.
- [ ] `_id`→`id`, operators translated, response shape unchanged.
- [ ] Services keep their exported signatures; internals use the passed `tx`
      (add a `tx` parameter to service helpers, or have them open their own
      `scopedDb`/`platformDb` — match how the route calls them).
