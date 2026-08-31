export type ApiErrorCode =
  | "offline"
  | "timeout"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation"
  | "expired"
  | "server"
  | "business"
  | "unknown";

export type ApiLocale = "ar" | "en";

export type LocalizedApiError = Error & {
  apiErrorCode: ApiErrorCode;
  statusCode: number;
  fields?: Record<string, string[]>;
  serverMessage?: string;
  localized: true;
};

const MESSAGES: Record<ApiLocale, Record<Exclude<ApiErrorCode, "business">, string>> = {
  ar: {
    offline: "تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.",
    timeout: "استغرق الطلب وقتًا أطول من المعتاد. حاول مرة أخرى.",
    unauthenticated: "انتهت الجلسة. سجّل الدخول مرة أخرى.",
    forbidden: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
    not_found: "العنصر المطلوب غير موجود.",
    conflict: "تم تنفيذ هذه العملية من قبل، أو يوجد سجل مطابق بالفعل.",
    rate_limited: "محاولات كثيرة. انتظر قليلًا ثم حاول مرة أخرى.",
    validation: "تحقق من البيانات المدخلة وحاول مرة أخرى.",
    expired: "انتهت صلاحية هذا الرابط أو الرمز.",
    server: "حدث خطأ في الخادم. حاول مرة أخرى بعد قليل.",
    unknown: "حدث خطأ ما. حاول مرة أخرى.",
  },
  en: {
    offline: "Could not reach the server. Check your internet connection and try again.",
    timeout: "The request took too long. Please try again.",
    unauthenticated: "Your session has ended. Please sign in again.",
    forbidden: "You don't have permission to do this.",
    not_found: "The requested item was not found.",
    conflict: "This was already done, or a matching record already exists.",
    rate_limited: "Too many attempts. Wait a moment and try again.",
    validation: "Check the entered data and try again.",
    expired: "This link or code has expired.",
    server: "A server error occurred. Please try again shortly.",
    unknown: "Something went wrong. Please try again.",
  },
};

const ENVELOPE_CODE_MAP: Record<string, ApiErrorCode> = {
  unauthenticated: "unauthenticated",
  session_conflict: "unauthenticated",
  forbidden: "forbidden",
  two_factor_required: "forbidden",
  not_found: "not_found",
  conflict: "conflict",
  rate_limited: "rate_limited",
  validation_error: "validation",
  expired: "expired",
  internal: "server",
};

function statusToCode(status: number): ApiErrorCode {
  if (status === 401) return "unauthenticated";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 422) return "validation";
  if (status >= 500) return "server";
  return "unknown";
}

export function detectApiLocale(): ApiLocale {
  if (typeof document !== "undefined") {
    const lang = (document.documentElement.lang || "").toLowerCase();
    if (lang.startsWith("en")) return "en";
    if (lang.startsWith("ar")) return "ar";
  }
  if (typeof window !== "undefined") {
    const seg = window.location.pathname.split("/")[1];
    if (seg === "en") return "en";
  }
  return "ar";
}

export function apiErrorMessage(code: ApiErrorCode, locale?: ApiLocale): string {
  const resolved = locale ?? detectApiLocale();
  if (code === "business") return MESSAGES[resolved].unknown;
  return MESSAGES[resolved][code];
}

type ErrorShape = {
  name?: string;
  message?: string;
  response?: { status?: number };
  status?: number;
  data?: unknown;
  localized?: boolean;
};

function readEnvelope(data: unknown): {
  code?: string;
  message?: string;
  messageAr?: string;
  fields?: Record<string, string[]>;
} {
  if (!data || typeof data !== "object") return {};
  const err = (data as { error?: unknown }).error;
  if (!err || typeof err !== "object") {
    const message = (data as { message?: unknown }).message;
    return typeof message === "string" ? { message } : {};
  }
  const { code, message, messageAr, fields, details } = err as {
    code?: string;
    message?: string;
    messageAr?: string;
    fields?: Record<string, string[]>;
    details?: { fields?: Record<string, string[]> };
  };
  return {
    code: typeof code === "string" ? code : undefined,
    message: typeof message === "string" ? message : undefined,
    messageAr: typeof messageAr === "string" ? messageAr : undefined,
    fields: fields ?? details?.fields,
  };
}

export function classifyApiError(error: unknown): {
  code: ApiErrorCode;
  statusCode: number;
  serverMessage?: string;
  serverMessageAr?: string;
  fields?: Record<string, string[]>;
} {
  const e = (error ?? {}) as ErrorShape;
  const status = e.response?.status ?? (typeof e.status === "number" ? e.status : undefined);

  if (status === undefined || status === 0) {
    if (e.name === "TimeoutError") return { code: "timeout", statusCode: 0 };
    if (e.name === "AbortError") return { code: "unknown", statusCode: 0 };
    if (
      error instanceof TypeError ||
      /fetch|network|load failed/i.test(e.message ?? "")
    ) {
      return { code: "offline", statusCode: 0 };
    }
    return { code: "unknown", statusCode: 0 };
  }

  const envelope = readEnvelope(e.data);
  if (envelope.code) {
    const mapped = ENVELOPE_CODE_MAP[envelope.code];
    if (mapped) {
      return {
        code: mapped,
        statusCode: status,
        serverMessage: envelope.message,
        serverMessageAr: envelope.messageAr,
        fields: envelope.fields,
      };
    }
    if (status < 500) {
      return {
        code: "business",
        statusCode: status,
        serverMessage: envelope.message,
        serverMessageAr: envelope.messageAr,
        fields: envelope.fields,
      };
    }
  }
  return {
    code: statusToCode(status),
    statusCode: status,
    serverMessage: envelope.message,
    serverMessageAr: envelope.messageAr,
    fields: envelope.fields,
  };
}

export function localizeApiError(error: unknown, locale?: ApiLocale): LocalizedApiError {
  const base: Error =
    error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  const target = base as LocalizedApiError;
  if (target.localized) return target;

  const { code, statusCode, serverMessage, serverMessageAr, fields } =
    classifyApiError(error);
  target.apiErrorCode = code;
  target.statusCode = statusCode;
  if (fields) target.fields = fields;
  if (serverMessage) target.serverMessage = serverMessage;

  const resolvedLocale = locale ?? detectApiLocale();
  if (resolvedLocale === "ar" && serverMessageAr) {
    // The server sent a specific Arabic rendering — more precise than any
    // generic bucket, and `serverMessage` keeps the English for matchers.
    target.message = serverMessageAr;
  } else if (code === "business" && serverMessage) {
    target.message = serverMessage;
  } else {
    target.message = apiErrorMessage(code, resolvedLocale);
  }
  target.localized = true;
  return target;
}
