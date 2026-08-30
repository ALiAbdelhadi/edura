import { AppError } from "@repo/server-core/errors/classes";

export * from "@repo/server-core/errors/classes";

/**
 * The caller is authenticated but has not enrolled in two-factor auth, which the
 * back office requires. Distinct from ForbiddenError so the client can send them to
 * enrollment rather than showing a dead end.
 */
export class TwoFactorRequiredError extends AppError {
  constructor(message = "Two-factor authentication is required for back-office access") {
    super(403, "two_factor_required", message);
  }
}
