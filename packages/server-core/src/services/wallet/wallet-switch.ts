import { BusinessRuleError } from "../../errors/classes";

// Deployment switch for the stored-value wallet. EDURA_WALLET_ENABLED=0 runs a
// deployment where no balance can be created or spent: every lesson is paid by
// card through the gateway. The ERP hides the same surfaces through
// NEXT_PUBLIC_WALLET_ENABLED; this is the half that does not trust the UI.
export function walletEnabled(): boolean {
  return process.env.EDURA_WALLET_ENABLED !== "0";
}

export function assertWalletEnabled(): void {
  if (!walletEnabled()) {
    throw new BusinessRuleError("Wallet balances are not available on this deployment — pay by card");
  }
}
