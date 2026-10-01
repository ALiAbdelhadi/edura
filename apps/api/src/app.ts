import type { Hono } from "hono";
import { createServiceApp, type ServiceAppEnv } from "@repo/service-kit/create-app";
import { env } from "./env";
import { requestLog } from "./log";
import { ROUTES } from "./routes";
import { mountSessionLayer } from "./session-seam";

export type AppEnv = ServiceAppEnv;

export type CreateAppOptions = {
  proxySecret?: () => string | undefined;
  accessLog?: boolean;
};

export function createApp(opts: CreateAppOptions = {}): Hono<AppEnv> {
  return createServiceApp({
    routes: ROUTES,
    mountSession: mountSessionLayer,
    log: requestLog,
    proxySecret: opts.proxySecret ?? (() => env.proxySecret),
    accessLog: opts.accessLog ?? !env.isTest,
  });
}
