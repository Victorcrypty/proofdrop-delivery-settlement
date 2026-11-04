// ProofDrop contract parameters — LOCAL / CHIPNET PROTOTYPE ONLY.
// All amounts are integer satoshis (bigint). No floating point anywhere.
import { compileFile } from "cashc";
import { Contract, type NetworkProvider } from "cashscript";
import { binToHex, hexToBin } from "@bitauth/libauth";

export const DUST_LIMIT = 546n; // P2PKH-standard dust threshold used by tests
export const SECONDS_48H = 172_800;
const SEQ_TIME_FLAG = 1 << 22; // BIP68 type flag: time-based, 512 s units
const SEQ_GRANULARITY = 512;

/** Smallest BIP68 time value >= the requested seconds (never shorter than asked). */
export function relativeTimeAge(seconds: number) {
  if (!Number.isInteger(seconds) || seconds <= 0) throw new Error("seconds must be a positive integer");
  const units = Math.ceil(seconds / SEQ_GRANULARITY);
  if (units > 0xffff) throw new Error("relative timelock too long");
  return { units, effectiveSeconds: units * SEQ_GRANULARITY, encoded: SEQ_TIME_FLAG | units };
}

export interface ProofDropParams {
  buyerPk: Uint8Array;
  sellerPk: Uint8Array;
  courierPk: Uint8Array;
  buyerLockingBytecode: Uint8Array; // buyer refund destination
  sellerLockingBytecode: Uint8Array;
  courierLockingBytecode: Uint8Array;
  sellerAmount: bigint;
  courierFee: bigint;
  refundDeadline: bigint; // absolute unix time (seconds), must be >= 500_000_000
  fallbackAge: bigint; // BIP68-encoded relative timelock (see relativeTimeAge)
}

export function validateParams(p: ProofDropParams): void {
  for (const [k, v] of Object.entries(p)) if (typeof v === "number") throw new Error(`${k} must be bigint/bytes, not a float-capable number`);
  if (p.sellerAmount < DUST_LIMIT) throw new Error("sellerAmount below dust limit");
  if (p.courierFee < DUST_LIMIT) throw new Error("courierFee below dust limit");
  if (p.refundDeadline < 500_000_000n) throw new Error("refundDeadline must be a unix timestamp, not a block height");
  if ((p.fallbackAge & BigInt(SEQ_TIME_FLAG)) === 0n) throw new Error("fallbackAge must be time-based");
  const lbs = [p.buyerLockingBytecode, p.sellerLockingBytecode, p.courierLockingBytecode].map(binToHex);
  if (new Set(lbs).size !== 3) throw new Error("buyer, seller and courier destinations must differ");
  for (const pk of [p.buyerPk, p.sellerPk, p.courierPk]) if (pk.length !== 33) throw new Error("pubkeys must be 33-byte compressed");
}

const escrowArtifact = compileFile(new URL("./EscrowContract.cash", import.meta.url));
const collectedArtifact = compileFile(new URL("./CollectedContract.cash", import.meta.url));
export const artifacts = { escrow: escrowArtifact, collected: collectedArtifact };

/** Build both contracts. CollectedContract first: its locking bytecode is an Escrow parameter. */
export function buildContracts(p: ProofDropParams, provider: NetworkProvider) {
  validateParams(p);
  const collected = new Contract(collectedArtifact, [
    p.buyerPk, p.sellerPk, p.courierPk, p.sellerLockingBytecode, p.courierLockingBytecode,
    p.sellerAmount, p.courierFee, p.fallbackAge,
  ], { provider, addressType: "p2sh32" });
  const principal = p.sellerAmount + p.courierFee;
  const escrow = new Contract(escrowArtifact, [
    p.buyerPk, p.courierPk, hexToBin(collected.lockingBytecode), p.buyerLockingBytecode, principal, p.refundDeadline,
  ], { provider, addressType: "p2sh32" });
  return { escrow, collected, principal };
}

/** JSON-safe form for saving with an order (hex bytes, decimal-string satoshis). */
export function serializeParams(p: ProofDropParams): Record<string, string> {
  return Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v instanceof Uint8Array ? binToHex(v) : v.toString()]));
}
export function deserializeParams(s: Record<string, string>): ProofDropParams {
  const b = (k: string) => { const v = s[k]; if (!v || !/^[0-9a-f]*$/.test(v)) throw new Error(`bad ${k}`); return hexToBin(v); };
  const n = (k: string) => { const v = s[k]; if (!v || !/^\d+$/.test(v)) throw new Error(`bad ${k}`); return BigInt(v); };
  return {
    buyerPk: b("buyerPk"), sellerPk: b("sellerPk"), courierPk: b("courierPk"),
    buyerLockingBytecode: b("buyerLockingBytecode"), sellerLockingBytecode: b("sellerLockingBytecode"), courierLockingBytecode: b("courierLockingBytecode"),
    sellerAmount: n("sellerAmount"), courierFee: n("courierFee"), refundDeadline: n("refundDeadline"), fallbackAge: n("fallbackAge"),
  };
}
