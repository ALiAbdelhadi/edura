import { AppError, NotFoundError } from "@repo/server-core/errors/classes";
import { withErrors } from "@repo/server-core/errors/http";
import { requireSession } from "@repo/server-core/erp-auth/session";
import { ok } from "@repo/server-core/http/envelope";
import { buildReceiptDocument } from "@repo/server-core/services/payments/receipt-document";

// The receipt page's read. Any AppError from the build (not found, another
// tenant's payment) is a 404, as the page's notFound() was: it never says
// whether the payment exists.
export const GET = withErrors(async (_req, ctx) => {
  const user = await requireSession();
  const paymentId = (await ctx.params).id!;
  try {
    return ok(await buildReceiptDocument(paymentId, user));
  } catch (err) {
    if (err instanceof AppError) throw new NotFoundError();
    throw err;
  }
});
