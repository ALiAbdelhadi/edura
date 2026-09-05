import { describe, it, expect } from "vitest";
import {
  buildFieldSchema,
  type FieldSpec,
} from "@/features/admin/catalog/entity-dialog";

// The real translator; only the shape of the message matters here.
const t = (key: string, v?: Record<string, string | number>) =>
  key === "common.fieldRequired"
    ? `${v?.field} is required`
    : key === "common.minValue"
      ? `${v?.field} must be at least ${v?.min}`
      : "Enter a valid email address";

function check(fields: FieldSpec[], values: Record<string, unknown>) {
  const res = buildFieldSchema(fields, t).safeParse(values);
  return res.success
    ? { ok: true as const, data: res.data }
    : {
        ok: false as const,
        issues: res.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      };
}

describe("M-11 buildFieldSchema — the rules every dialog now shares", () => {
  it("names the empty field instead of one toast naming none of them", () => {
    const r = check(
      [
        { name: "email", label: "Email", type: "email", required: true },
        { name: "name", label: "Name", type: "text", required: true },
      ],
      { email: "", name: "" },
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.issues).toEqual([
      "email: Email is required",
      "name: Name is required",
    ]);
  });

  it("rejects a malformed email on the field, not as a server round-trip", () => {
    const r = check(
      [{ name: "email", label: "Email", type: "email", required: true }],
      { email: "nope" },
    );
    expect(r.ok === false && r.issues).toEqual([
      "email: Enter a valid email address",
    ]);
  });

  it("lets an optional email be left blank", () => {
    expect(
      check([{ name: "email", label: "Email", type: "email" }], { email: "" }).ok,
    ).toBe(true);
  });

  it("treats an empty money box as unfilled, not as the number zero", () => {
    const fields: FieldSpec[] = [
      { name: "amount", label: "Amount", type: "number", required: true, min: 0.01 },
    ];
    expect(check(fields, { amount: "" }).ok === false && check(fields, { amount: "" }).issues)
      .toEqual(["amount: Amount is required"]);
  });

  it("refuses a zero-value receipt but accepts piaster precision", () => {
    const fields: FieldSpec[] = [
      { name: "amount", label: "Amount", type: "number", required: true, min: 0.01 },
    ];
    expect(check(fields, { amount: 0 }).ok === false && check(fields, { amount: 0 }).issues)
      .toEqual(["amount: Amount must be at least 0.01"]);
    expect(check(fields, { amount: "0.5" })).toEqual({ ok: true, data: { amount: 0.5 } });
  });

  it("leaves an unbounded number field free to be zero", () => {
    // A hall with no capacity set is a real state; only money boxes pass `min`.
    expect(check([{ name: "capacity", label: "Capacity", type: "number" }], { capacity: 0 }))
      .toEqual({ ok: true, data: { capacity: 0 } });
  });

  it("requiredWhen fires only in the mode that needs it, and on the right field", () => {
    const fields: FieldSpec[] = [
      { name: "scope", label: "Scope", type: "select", required: true },
      {
        name: "courseId",
        label: "Course",
        type: "select",
        requiredWhen: (v) => v.scope === "course",
      },
    ];
    expect(check(fields, { scope: "center", courseId: "" }).ok).toBe(true);
    const scoped = check(fields, { scope: "course", courseId: "" });
    expect(scoped.ok === false && scoped.issues).toEqual([
      "courseId: Course is required",
    ]);
  });

  it("validates a custom field like any other — the picker is not a hole", () => {
    const fields: FieldSpec[] = [
      { name: "studentId", label: "Student", type: "custom", required: true },
    ];
    const r = check(fields, { studentId: "" });
    expect(r.ok === false && r.issues).toEqual(["studentId: Student is required"]);
    expect(check(fields, { studentId: "stu_1" }).ok).toBe(true);
  });
});

describe("M-11 cross-field rules and set-valued fields", () => {
  it("puts 'end after start' on the end box, not in a toast naming neither", () => {
    const fields: FieldSpec[] = [
      { name: "startTime", label: "From", type: "select", required: true },
      {
        name: "endTime",
        label: "To",
        type: "select",
        required: true,
        validate: (v) =>
          String(v.endTime) <= String(v.startTime) ? "End must be after start" : undefined,
      },
    ];
    const bad = check(fields, { startTime: "18:00", endTime: "16:00" });
    expect(bad.ok === false && bad.issues).toEqual(["endTime: End must be after start"]);
    expect(check(fields, { startTime: "16:00", endTime: "18:00" }).ok).toBe(true);
  });

  it("does not run a cross-field rule against a box that is still empty", () => {
    const fields: FieldSpec[] = [
      {
        name: "endTime",
        label: "To",
        type: "select",
        required: true,
        validate: () => "never reached",
      },
    ];
    const r = check(fields, { endTime: "" });
    expect(r.ok === false && r.issues).toEqual(["endTime: To is required"]);
  });

  it("treats an empty set as nothing entered", () => {
    const fields: FieldSpec[] = [
      { name: "days", label: "Days", type: "custom", required: true },
    ];
    const r = check(fields, { days: [] });
    expect(r.ok === false && r.issues).toEqual(["days: Days is required"]);
    expect(check(fields, { days: [0, 2] })).toEqual({ ok: true, data: { days: [0, 2] } });
  });
});

describe("M-11 optional number fields", () => {
  const payout: FieldSpec[] = [
    // The payout amount: blank means "the whole balance", so it must not be
    // reported as a missing answer.
    { name: "amount", label: "Amount", type: "number", min: 0 },
  ];

  it("lets an optional amount be left blank", () => {
    expect(check(payout, { amount: "" }).ok).toBe(true);
  });

  it("still bounds an optional amount when one is entered", () => {
    const r = check(payout, { amount: -5 });
    expect(r.ok === false && r.issues).toEqual(["amount: Amount must be at least 0"]);
  });

  it("requires a money box that is marked required", () => {
    const fields: FieldSpec[] = [
      { name: "amount", label: "Amount", type: "number", required: true, min: 0.01 },
    ];
    const r = check(fields, { amount: "" });
    expect(r.ok === false && r.issues).toEqual(["amount: Amount is required"]);
  });
});
