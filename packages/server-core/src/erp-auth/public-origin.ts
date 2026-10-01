// The origin the browser reaches the ERP on. It is better-auth's baseURL, so a
// session cookie and a redirect that carries it name the same host — which is
// why a route builds its redirects from here rather than from the request URL:
// behind the service rewrite that URL names the service, not the public host.
export function erpPublicOrigin(): string {
  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}
