export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  // The request carried MORE THAN ONE session credential, so which person is
  // asking has no answer. Distinct from `unauthenticated` on purpose: the fix
  // is not "sign in", it is "clear what this browser is holding" — and the
  // client can only do the right thing if the refusal says which it is.
  | "session_conflict"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "expired"
  | "business_rule"
  // Messaging send/new-conversation buckets surface as HTTP 429; the socket
  // transport maps the same domain code onto its ack payload.
  | "rate_limited"
  | "internal";

export class AppError extends Error {
  public readonly status: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", fields?: Record<string, string[]>) {
    super(400, "validation_error", message, fields ? { fields } : undefined);
  }
}

export class AuthError extends AppError {
  constructor(message = "Not authenticated") {
    super(401, "unauthenticated", message);
  }
}

/**
 * 401, and deliberately NOT `AuthError`.
 *
 * "You are not signed in" and "this browser is holding two sessions" call for
 * opposite responses: the first is fixed by signing in, the second by signing
 * OUT (which is what clears the surplus credential). A client that cannot tell
 * them apart sends the reader to a login screen that will hand them back the
 * same ambiguity. See docs/reports/session-identity-mismatch.md.
 */
export class SessionConflictError extends AppError {
  constructor(message = "Multiple sessions present") {
    super(401, "session_conflict", message);
  }
}

export class ForbiddenError extends AppError {
  /**
   * `details` exists so a refusal can carry WHY in a form code can read.
   * `requireRole` uses it to mark a role mismatch, which the client turns into
   * "your session is not who this screen thinks you are" instead of showing an
   * English internal string to an Arabic-first parent.
   */
  constructor(message = "Forbidden", details?: unknown) {
    super(403, "forbidden", message, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "not_found", message);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(409, "conflict", message, details);
  }
}

export class ExpiredError extends AppError {
  constructor(message = "Expired") {
    super(410, "expired", message);
  }
}

export class BusinessRuleError extends AppError {
  constructor(message = "Business rule violated", details?: unknown) {
    super(422, "business_rule", message, details);
  }
}
