import { neonConfig } from "@neondatabase/serverless";

/**
 * ============================================================================
 * NEON WEBSOCKET ERROR NORMALIZATION
 * ============================================================================
 * WHY THIS EXISTS
 *
 * A dropped Neon WebSocket used to kill the whole node process with
 *
 *     prisma:error undefined
 *     ErrorEvent { type: 'error', defaultPrevented: false, ... }
 *     UnhandledPromiseRejection: ... reason "#<_ErrorEvent>"
 *     code: 'ERR_UNHANDLED_REJECTION'
 *
 * — no assertion failure, no Prisma error, nothing catchable at the await site.
 * The full chain, traced through the shipped bundles:
 *
 *   1. @neondatabase/serverless' Socket shim wires the raw browser event
 *      straight onto its EventEmitter:
 *          ws.addEventListener("error", e => { this.emit("error", e); ... })
 *      so what travels onward is an `ErrorEvent`, NOT an `Error`.
 *   2. The bundled pg Client hands that object to the in-flight query, which
 *      rejects with it verbatim.
 *   3. @prisma/adapter-neon's `performIO` catches it and calls `onError` →
 *      `convertDriverError` → `isDriverError(e)`, which requires a string
 *      `e.severity`. An ErrorEvent has none, so `convertDriverError` falls
 *      through to a bare `throw error` — the ErrorEvent, still unwrapped.
 *   4. Prisma cannot classify a non-Error rejection. It logs `prisma:error
 *      undefined` and the rejection escapes every `catch` in the stack, so it
 *      lands on the process as ERR_UNHANDLED_REJECTION.
 *
 * Step 1 is the only place where the type is still fixable without patching a
 * dependency, so that is where we intervene: hand neon's shim a real `Error`.
 * Everything downstream then behaves normally — the rejection surfaces at the
 * caller's `await`, is catchable, and carries a usable stack and `code`.
 *
 * WHY IT INTERCEPTS THE SETTER RATHER THAN JUST SETTING A VALUE
 *
 * `neonConfig.webSocketConstructor` is written from many places: this package,
 * and ~40 DB test suites that each do `neonConfig.webSocketConstructor = ws` at
 * module scope. A fix that only assigned a hardened constructor once would be
 * silently clobbered by whichever assignment happened to run last. Instead we
 * replace the property with an accessor that wraps ON EVERY WRITE, and wrap
 * whatever was already there. There is then no assignment order — past, present
 * or future, from any file — that can produce an unhardened socket, and no test
 * file needed editing.
 *
 * KNOWN GAP, stated rather than papered over: neon has a last-resort
 * `fetch(..., { Upgrade: "websocket" })` path that yields a socket without
 * consulting `webSocketConstructor` at all. That path is for Cloudflare-style
 * runtimes and is unreachable on Node, where a global `WebSocket` (Node >= 22)
 * or the `ws` package always succeeds first. It is not covered here.
 * ============================================================================
 */

/**
 * Set on every Error this module produces, so `isNeonSocketDropError` is an
 * exact check rather than a guess at messages or `errno` values.
 */
const SOCKET_DROP = Symbol.for("edura.neonSocketDrop");

/** Set on a wrapped constructor so wrapping is idempotent. */
const HARDENED = Symbol.for("edura.hardenedWebSocket");

/**
 * The prefix every error from this module carries. It is load-bearing, not
 * cosmetic: see `isNeonSocketDropError`.
 */
const MESSAGE_PREFIX = "Neon WebSocket transport error: ";

/**
 * True for the transport-level failures this module normalizes: the Neon
 * WebSocket went away underneath an in-flight query.
 *
 * Two legs, because there are two shapes this can reach a caller in:
 *
 *   1. the symbol, when our Error object itself propagates;
 *   2. the message prefix, because once the error is a real Error, Prisma
 *      SUCCEEDS in classifying it and re-wraps it as a
 *      `PrismaClientKnownRequestError` — which copies the message through but
 *      not the instance, so the symbol is gone by the time a caller sees it.
 *      (Verified end-to-end against a live Neon connection: the caught error
 *      is a PrismaClientKnownRequestError whose message embeds this prefix.)
 *
 * Matching on a string is normally a smell; here the string is one WE emit and
 * own, which is why leg 2 is acceptable and why MESSAGE_PREFIX must not be
 * edited casually.
 *
 * This is deliberately NOT consulted by `transactionWithRetry` in client.ts —
 * see the comment there. It exists for callers that know their own work is
 * idempotent and can make that judgement for themselves.
 */
export function isNeonSocketDropError(err: unknown): boolean {
  for (let cur: unknown = err, hops = 0; cur != null && hops < 10; hops++) {
    if (typeof cur === "object") {
      if ((cur as Record<PropertyKey, unknown>)[SOCKET_DROP] === true) return true;
      const message = (cur as { message?: unknown }).message;
      if (typeof message === "string" && message.includes(MESSAGE_PREFIX)) {
        return true;
      }
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

export class NeonWebSocketError extends Error {
  override readonly name = "NeonWebSocketError";
  /** Mirrors the underlying socket error's code (ECONNRESET, EPIPE, ...). */
  readonly code?: string;

  constructor(message: string, options: { cause?: unknown; code?: string }) {
    super(message, { cause: options.cause });
    if (options.code !== undefined) this.code = options.code;
    Object.defineProperty(this, SOCKET_DROP, { value: true });
  }
}

/**
 * `ErrorEvent` → `Error`.
 *
 * Both implementations we can receive carry the real cause on `.error`:
 * `ws`'s ErrorEvent and the Node >= 22 global WebSocket's. We keep that as
 * `cause` (it has the true stack and errno) and lift its `code`, while giving
 * the surfaced error a message that names the transport — a bare
 * "read ECONNRESET" with no attribution is what made this hard to place.
 */
/** `wss://host/v2?…` → `host`, for an error event that carries no message. */
function describeTarget(event: unknown): string {
  const url = (event as { target?: { url?: unknown } } | null | undefined)
    ?.target?.url;
  if (typeof url !== "string") return "socket closed";
  try {
    return `socket to ${new URL(url).host} closed`;
  } catch {
    return "socket closed";
  }
}

export function toWebSocketError(event: unknown): Error {
  if (event instanceof NeonWebSocketError) return event;

  const cause = (event as { error?: unknown } | null | undefined)?.error;
  const underlying = cause instanceof Error ? cause : undefined;
  const fallback = event instanceof Error ? event : undefined;
  const source = underlying ?? fallback;

  const eventMessage = (event as { message?: unknown } | null | undefined)
    ?.message;
  const detail =
    source?.message ||
    (typeof eventMessage === "string" && eventMessage
      ? eventMessage
      : // The Node >= 22 global WebSocket (undici) reports a connect failure as
        // an ErrorEvent with an empty message and no `.error`, so without this
        // the production path would log a transport failure with nothing in it.
        // Host only, never the full URL — that is a habit worth keeping around
        // connection strings even where this particular one carries no secret.
        `${describeTarget(event)} (no detail on the ${String(
          (event as { type?: unknown } | null | undefined)?.type ?? "error",
        )} event)`);

  const code = (source as { code?: unknown } | undefined)?.code;

  return new NeonWebSocketError(`${MESSAGE_PREFIX}${detail}`, {
    cause: source ?? event,
    code: typeof code === "string" ? code : undefined,
  });
}

type Listener = (event: unknown) => void;
type AnyCtor = new (...args: never[]) => {
  addEventListener(type: string, listener: unknown, options?: unknown): void;
  removeEventListener(type: string, listener: unknown, options?: unknown): void;
};

/**
 * Per-socket original-listener → wrapped-listener map, so a later
 * `removeEventListener(original)` still finds what we actually registered.
 */
const wrappers = new WeakMap<object, Map<unknown, Listener>>();

function harden(Ctor: unknown): unknown {
  if (typeof Ctor !== "function") return Ctor;
  if ((Ctor as unknown as Record<PropertyKey, unknown>)[HARDENED] === true) {
    return Ctor;
  }

  const Base = Ctor as unknown as AnyCtor;

  class HardenedWebSocket extends Base {
    override addEventListener(
      type: string,
      listener: unknown,
      options?: unknown,
    ): void {
      if (type !== "error" || typeof listener !== "function") {
        return super.addEventListener(type, listener, options);
      }
      // THE FIX, in one line: neon's shim receives an Error, never an
      // ErrorEvent, so every consumer downstream of it sees a normal error.
      const wrapped: Listener = (event) =>
        (listener as Listener).call(this, toWebSocketError(event));

      let forThis = wrappers.get(this);
      if (!forThis) wrappers.set(this, (forThis = new Map()));
      forThis.set(listener, wrapped);

      return super.addEventListener(type, wrapped, options);
    }

    override removeEventListener(
      type: string,
      listener: unknown,
      options?: unknown,
    ): void {
      const wrapped =
        type === "error" ? wrappers.get(this)?.get(listener) : undefined;
      return super.removeEventListener(type, wrapped ?? listener, options);
    }
  }

  Object.defineProperty(HardenedWebSocket, HARDENED, { value: true });
  Object.defineProperty(HardenedWebSocket, "name", {
    value: `Hardened${(Ctor as { name?: string }).name || "WebSocket"}`,
  });
  return HardenedWebSocket;
}

let installed = false;

/**
 * Idempotent. Safe to call at module scope: it reads no environment variables
 * and opens no connection, so it does not reintroduce the import-time database
 * coupling that `client.ts` deliberately removed.
 */
export function hardenNeonWebSockets(): void {
  if (installed) return;
  installed = true;

  const target = neonConfig as unknown as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(
    target,
    "webSocketConstructor",
  );
  // Neon exposes this as a configurable accessor. If a future version makes it
  // non-configurable, degrade to leaving it alone rather than throwing at import.
  if (!descriptor?.configurable) return;

  const readRaw = descriptor.get
    ? () => descriptor.get!.call(target)
    : () => descriptor.value;
  const writeRaw = descriptor.set
    ? (value: unknown) => descriptor.set!.call(target, value)
    : (value: unknown) => {
        descriptor.value = value;
      };

  Object.defineProperty(target, "webSocketConstructor", {
    configurable: true,
    enumerable: descriptor.enumerable ?? true,
    get: () => readRaw(),
    set: (value: unknown) => writeRaw(harden(value)),
  });

  const current = readRaw();
  if (current !== undefined) {
    // Something already assigned before we got here — every DB test suite does,
    // at module scope. Re-write it through the wrapper.
    writeRaw(harden(current));
  } else if (typeof globalThis.WebSocket !== "undefined") {
    // Nothing was assigned and nothing will be: on Node >= 22 neon falls back to
    // the global `WebSocket` itself, bypassing the setter entirely. Seed it so
    // the runtime (as opposed to test) path is hardened too.
    writeRaw(harden(globalThis.WebSocket));
  }
}
