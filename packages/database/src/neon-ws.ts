import { neonConfig } from "@neondatabase/serverless";

const SOCKET_DROP = Symbol.for("edura.neonSocketDrop");

const HARDENED = Symbol.for("edura.hardenedWebSocket");

const MESSAGE_PREFIX = "Neon WebSocket transport error: ";

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
  readonly code?: string;

  constructor(message: string, options: { cause?: unknown; code?: string }) {
    super(message, { cause: options.cause });
    if (options.code !== undefined) this.code = options.code;
    Object.defineProperty(this, SOCKET_DROP, { value: true });
  }
}

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

export function hardenNeonWebSockets(): void {
  if (installed) return;
  installed = true;

  const target = neonConfig as unknown as Record<string, unknown>;
  const descriptor = Object.getOwnPropertyDescriptor(
    target,
    "webSocketConstructor",
  );
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
    writeRaw(harden(current));
  } else if (typeof globalThis.WebSocket !== "undefined") {
    writeRaw(harden(globalThis.WebSocket));
  }
}
