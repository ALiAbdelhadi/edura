import { setPublicDataInvalidator } from "@repo/server-core/cache/public-data";
import { bumpPublicDataTag, closePublicStore } from "@repo/server-core/cache/public-store";

// The service's side of the public-data seam: a write that changes a public
// listing bumps the shared store (cache/public-store.ts), which the ERP host
// binds the same way in next-bindings.ts.
export function bindPublicDataCache(): void {
  setPublicDataInvalidator(bumpPublicDataTag);
}

export { closePublicStore };
