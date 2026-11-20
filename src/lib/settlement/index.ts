// Single switch point for the settlement backend.
// Replace mockAdapter with a real BCH / XO adapter implementing SettlementAdapter.

import { bchAdapter } from "./bchAdapter";
import type { SettlementAdapter } from "./types";

export const settlement: SettlementAdapter = bchAdapter;

export * from "./types";

export { refundEligibility } from "./refund";

export const toSats = (bch: string) => Math.round(parseFloat(bch || "0") * 1e8);
export const fmtBCH = (sats: number) => (sats / 1e8).toFixed(8) + " BCH";