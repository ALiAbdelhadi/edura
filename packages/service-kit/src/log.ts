// Every line the service writes names the request it belongs to. The prefix is
// the service's own tag (`[api]`, `[admin-api]`).
export function createLog(servicePrefix: string) {
  return function requestLog(requestId: string) {
    const prefix = `${servicePrefix} rid=${requestId}`;
    return {
      info: (msg: string) => console.log(`${prefix} ${msg}`),
      warn: (msg: string) => console.warn(`${prefix} ${msg}`),
      error: (msg: string, err?: unknown) =>
        err === undefined ? console.error(`${prefix} ${msg}`) : console.error(`${prefix} ${msg}`, err),
    };
  };
}

export type RequestLog = ReturnType<typeof createLog>;
