export type ErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "session_conflict"
  | "forbidden"
  | "two_factor_required"
  | "not_found"
  | "conflict"
  | "expired"
  | "business_rule"
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

export class SessionConflictError extends AppError {
  constructor(message = "Multiple sessions present") {
    super(401, "session_conflict", message);
  }
}

export class ForbiddenError extends AppError {
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
