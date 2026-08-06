import type { Role } from "@repo/database";
import { jwtVerify } from "jose";
import { env, JWT_AUDIENCE, JWT_ISSUER } from "./env";

export type SocketUser = {
  id: string;
  role: Role;
  centerId: string | null;
  name: string;
};

const secretKey = new TextEncoder().encode(env.jwtSecret);

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
