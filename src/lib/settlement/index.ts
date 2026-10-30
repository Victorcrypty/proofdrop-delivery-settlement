// Single switch point for the settlement backend.
// Replace mockAdapter with a real BCH / XO adapter implementing SettlementAdapter.
import { mockAdapter } from "./mockAdapter";
import type { SettlementAdapter } from "./types";

export const settlement: SettlementAdapter = mockAdapter;
export * from "./types";

export const toSats = (bch: string) => Math.round(parseFloat(bch || "0") * 1e8);
export const fmtBCH = (sats: number) => `${Number((sats / 1e8).toFixed(8))} BCH`;
