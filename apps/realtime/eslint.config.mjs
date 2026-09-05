import { config } from "@repo/eslint-config/base";

// The base config, not next-app or react-internal: this is a plain Bun/Node
// Socket.IO server with no React and no Next.js. It carried a `lint` script
// with no config file at all since the app was added, so `eslint .` could
// never have run here.
/** @type {import("eslint").Linter.Config[]} */
export default config;
