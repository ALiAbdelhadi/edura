import { describe, expect, it, vi } from "vitest";
import {
  applyServerFieldErrors,
  clearServerFieldErrors,
} from "@repo/ui/lib/form-errors";

/**
 * A stand-in for the slice of `UseFormReturn` the helper touches. The point of
 * these tests is the routing decision — which message goes to which field, and
 * what happens to a key no input exists for — not react-hook-form's internals.
 */
function fakeForm(values: Record<string, unknown>) {
  const setError = vi.fn();
  const clearErrors = vi.fn();
  const states: Record<string, { error?: { type: string } }> = {};
  return {
    form: {
      getValues: () => values,
      setError,
      clearErrors,
      getFieldState: (name: string) => states[name] ?? {},
    } as never,
    setError,
    clearErrors,
    states,
  };
}

describe("applyServerFieldErrors (M-7 / M-22)", () => {
  it("puts a 422's field message on the field it names", () => {
    const { form, setError } = fakeForm({ code: "", nameAr: "" });
    const placed = applyServerFieldErrors(form, { code: ["Code is already taken"] });

    expect(placed).toBe(true);
    expect(setError).toHaveBeenCalledWith(
      "code",
      { type: "server", message: "Code is already taken" },
      { shouldFocus: true },
    );
  });

  it("focuses only the first field when several are rejected", () => {
    const { form, setError } = fakeForm({ code: "", nameAr: "" });
    applyServerFieldErrors(form, { code: ["bad code"], nameAr: ["bad name"] });

    expect(setError.mock.calls[0]?.[2]).toEqual({ shouldFocus: true });
    expect(setError.mock.calls[1]?.[2]).toEqual({ shouldFocus: false });
  });

  it("routes a nested path to the field its head names", () => {
    const { form, setError } = fakeForm({ schedule: {} });
    applyServerFieldErrors(form, { "schedule.startTime": ["Too early"] });

    expect(setError).toHaveBeenCalledWith(
      "schedule.startTime",
      { type: "server", message: "Too early" },
      { shouldFocus: true },
    );
  });

  it("does NOT drop a message for a field the form has no input for", () => {
    // The server's `_` bucket and any field this dialog does not render would
    // otherwise vanish: the operator would see a form with nothing marked.
    const { form, setError } = fakeForm({ code: "" });
    const placed = applyServerFieldErrors(form, {
      _: ["Body must be an object"],
      centerId: ["Unknown center"],
    });

    expect(placed).toBe(false);
    expect(setError).toHaveBeenCalledWith("root.serverError", {
      type: "server",
      message: "Body must be an object Unknown center",
    });
  });

  it("reports false when there is nothing to place, so a caller can fall back", () => {
    const { form, setError } = fakeForm({ code: "" });
    expect(applyServerFieldErrors(form, undefined)).toBe(false);
    expect(applyServerFieldErrors(form, {})).toBe(false);
    expect(applyServerFieldErrors(form, { code: [] })).toBe(false);
    expect(applyServerFieldErrors(form, { code: ["   "] })).toBe(false);
    expect(setError).not.toHaveBeenCalled();
  });

  it("clears only what the server set, leaving client validation alone", () => {
    const { form, clearErrors, states } = fakeForm({ code: "", nameAr: "" });
    states.code = { error: { type: "server" } };
    states.nameAr = { error: { type: "too_small" } };

    clearServerFieldErrors(form);

    expect(clearErrors).toHaveBeenCalledWith("root.serverError");
    expect(clearErrors).toHaveBeenCalledWith("code");
    expect(clearErrors).not.toHaveBeenCalledWith("nameAr");
  });
});
