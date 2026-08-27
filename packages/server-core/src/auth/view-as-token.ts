import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@repo/database";

export const VIEW_AS_TOKEN_TTL_SECONDS = 60;

export const VIEW_AS_SESSION_TTL_SECONDS = 60 * 60;

export type ViewAsPayload = {
  sub: string;
  act: string;
  role: Role;
  jti: string;
  iat: number;
  exp: number;
};

function viewAsSecret(): string {
  const value = process.env.VIEW_AS_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "VIEW_AS_SECRET is required in production (back-office 'view as' handoff tokens are signed with it, and BOTH apps must carry the same value)",
    );
  }
  return "edura-development-view-as-secret";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function unb64url(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", viewAsSecret()).update(body).digest());
}

export function mintViewAsToken(input: {
  targetUserId: string;
  actorUserId: string;
  targetRole: Role;
}): { token: string; jti: string; expiresAt: Date } {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + VIEW_AS_TOKEN_TTL_SECONDS;
  const jti = randomBytes(16).toString("hex");
  const payload: ViewAsPayload = {
    sub: input.targetUserId,
    act: input.actorUserId,
    role: input.targetRole,
    jti,
    iat,
    exp,
  };
  const body = b64url(JSON.stringify(payload));
  return { token: `${body}.${sign(body)}`, jti, expiresAt: new Date(exp * 1000) };
}

export function verifyViewAsToken(token: string | null | undefined): ViewAsPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts as [string, string];
  if (!body || !signature) return null;

  let expected: Buffer;
  let given: Buffer;
  try {
    expected = unb64url(sign(body));
    given = unb64url(signature);
  } catch {
    return null;
  }
  if (expected.length !== given.length) return null;
  if (!timingSafeEqual(expected, given)) return null;

  let payload: ViewAsPayload;
  try {
    payload = JSON.parse(unb64url(body).toString("utf8")) as ViewAsPayload;
  } catch {
    return null;
  }
  if (
    typeof payload?.sub !== "string" ||
    typeof payload?.act !== "string" ||
    typeof payload?.jti !== "string" ||
    typeof payload?.exp !== "number"
  ) {
    return null;
  }
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

export function isViewAsExpired(session: {
  impersonatedBy?: string | null;
  createdAt?: Date | string | null;
}): boolean {
  if (!session.impersonatedBy || !session.createdAt) return false;
  const age = Date.now() - new Date(session.createdAt).getTime();
  return age > VIEW_AS_SESSION_TTL_SECONDS * 1000;
}
