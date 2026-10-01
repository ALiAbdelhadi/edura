// This package runs in the browser and on the edge as well as in Node, so the
// only Node global it may touch is `process.env` (inlined or provided by every
// runtime it ships to). Declared here instead of pulling in @types/node, so a
// Node-only API used by mistake fails the type check.
declare const process: { readonly env: Record<string, string | undefined> };
