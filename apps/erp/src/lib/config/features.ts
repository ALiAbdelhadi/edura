// Deployment switch for the stored-value wallet (student wallet, parent wallet,
// teacher wallet screen). "0" builds a deployment where every lesson is paid by
// card straight through the gateway and no wallet surface is rendered; the API
// enforces the same switch through EDURA_WALLET_ENABLED. Inlined at build time.
export const WALLET_ENABLED = process.env.NEXT_PUBLIC_WALLET_ENABLED !== "0";
