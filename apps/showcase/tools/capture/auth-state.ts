import path from "node:path";
import type { Role } from "./screens";

export const STATE_DIR = path.resolve(__dirname, "../../.auth");

export const statePath = (role: Role) => path.join(STATE_DIR, `${role}.json`);
