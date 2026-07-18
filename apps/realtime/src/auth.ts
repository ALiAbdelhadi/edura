import { jwtVerify } from "jose";
import type { Role } from "@repo/database";
import { env, JWT_AUDIENCE, JWT_ISSUER } from "./env";

export type SocketUser = {
  id: string;
  role: Role;
  centerId: string | null;
  name: string;
};

const secretKey = new TextEncoder().encode(env.jwtSecret);

/**
 * Verifies the short-lived handshake token minted by Next.js. Everything the
 * server trusts about the socket (identity, role) comes from HERE — never from
 * client-supplied payload fields.
 */
export async function verifySocketToken(token: string): Promise<SocketUser> {
  const { payload } = await jwtVerify(token, secretKey, {
    audience: JWT_AUDIENCE,
    issuer: JWT_ISSUER,
  });
  if (!payload.sub || typeof payload.role !== "string") {
    throw new Error("Malformed realtime token");
  }
  return {
    id: payload.sub,
    role: payload.role as Role,
    centerId: typeof payload.centerId === "string" ? payload.centerId : null,
    name: typeof payload.name === "string" ? payload.name : "",
  };
}
