import { healthResponse } from "@repo/server-core/http/health";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(): Promise<Response> {
  return healthResponse();
}

export async function HEAD(): Promise<Response> {
  const res = await healthResponse();
  return new Response(null, { status: res.status, headers: res.headers });
}
