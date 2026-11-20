// LIVE BCH ADAPTER — broadcasts real transactions via CashScript + Electrum.
// Demo custody: the app holds the three party keys per order so one browser can
// play buyer, seller and courier. Disclosed in the submission writeup.
import { Contract, ElectrumNetworkProvider, SignatureTemplate, TransactionBuilder, type Utxo } from "cashscript";
import { generatePrivateKey, secp256k1, hash160, hexToBin, binToHex } from "@bitauth/libauth";
import { artifacts, serializeParams, type ProofDropParams } from "../../contracts/src/params";
import { buildCollect, buildRelease, buildRefund } from "../../contracts/src/tx";
import type { Actor, Order, OrderInput, Result, SettlementAdapter, SettlementStatus } from "./types";
import { STATUS_ORDER } from "./types";
import { refundEligibility } from "./refund";

type ProviderMap = Record<"chipnet" | "mainnet", ElectrumNetworkProvider>;
const providers: ProviderMap = {} as ProviderMap;
function getProvider(net: "chipnet" | "mainnet") {
  if (!providers[net]) providers[net] = new ElectrumNetworkProvider(net);
  return providers[net];
}

const rand = (n: number, chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

const idx = (o: Order) => STATUS_ORDER.indexOf(o.status);
const at = (s: SettlementStatus) => STATUS_ORDER.indexOf(s);
const fail = (reason: string): Result => ({ ok: false, reason });

// ---- per-order live state (stored on the order's localStorage record) ----
interface LiveState {
  network: "chipnet" | "mainnet";
  params: Record<string, string>; // serializeParams output
  escrowAddress: string;
  collectedAddress: string;
  principal: string; // decimal string
  keys: { buyer: string; seller: string; courier: string; funder: string }; // hex
  escrowTxid?: string;
  collectTxid?: string;
  releaseTxid?: string;
  refundTxid?: string;
}

const LS_PREFIX = "proofdrop.live.v1.";
const saveLive = (id: string, s: LiveState) => localStorage.setItem(LS_PREFIX + id, JSON.stringify(s));
const loadLive = (id: string): LiveState | null => {
  const raw = localStorage.getItem(LS_PREFIX + id);
  return raw ? (JSON.parse(raw) as LiveState) : null;
};

function p2pkhBytecode(pk: Uint8Array): Uint8Array {
  return hexToBin("76a914" + binToHex(hash160(pk)) + "88ac");
}

function addressOf(privHex: string, network: "chipnet" | "mainnet"): string {
  // minimal cashaddr encoder is avoided; we only need it for display, so we
  // keep bytecode and use the treasury address the user funded instead.
  return privHex; // placeholder, addresses come from contract objects
}

function buildFromState(state: LiveState) {
  const provider = getProvider(state.network);
  const p: ProofDropParams = {
    buyerPk: hexToBin(state.params.buyerPk),
    sellerPk: hexToBin(state.params.sellerPk),
    courierPk: hexToBin(state.params.courierPk),
    buyerLockingBytecode: hexToBin(state.params.buyerLockingBytecode),
    sellerLockingBytecode: hexToBin(state.params.sellerLockingBytecode),
    courierLockingBytecode: hexToBin(state.params.courierLockingBytecode),
    sellerAmount: BigInt(state.params.sellerAmount),
    courierFee: BigInt(state.params.courierFee),
    refundDeadline: BigInt(state.params.refundDeadline),
    fallbackAge: BigInt(state.params.fallbackAge),
  };
  const collected = new Contract(artifacts.collected, [
    p.buyerPk, p.sellerPk, p.courierPk, p.sellerLockingBytecode, p.courierLockingBytecode,
    p.sellerAmount, p.courierFee, p.fallbackAge,
  ], { provider, addressType: "p2sh32" });
  const principal = p.sellerAmount + p.courierFee;
  const escrow = new Contract(artifacts.escrow, [
    p.buyerPk, p.courierPk, hexToBin(collected.lockingBytecode), p.buyerLockingBytecode, principal, p.refundDeadline,
  ], { provider, addressType: "p2sh32" });
  return { provider, p, collected, escrow, principal };
}

async function bestUtxo(provider: ElectrumNetworkProvider, privHex: string, bytecode: Uint8Array, minSats: bigint): Promise<Utxo | null> {
  // the funder key's address is derived by the treasury setup; we keep a
  // parallel record of its address at treasury setup time
  const addr = localStorage.getItem("proofdrop.live.treasury." + privHex.slice(0, 16));
  if (!addr) return null;
  const utxos = await provider.getUtxos(addr);
  return utxos.sort((a, b) => Number(b.satoshis) - Number(a.satoshis)).find((u) => u.satoshis > minSats) ?? null;
}

const ev = (actor: Actor, label: string, txid?: string) => ({ at: new Date().toISOString(), actor, label, txid });

export const bchAdapter: SettlementAdapter = {
  mode: "live",

  async createSettlement(input: OrderInput) {
    if (input.itemSats <= 0) return fail("Item amount must be greater than zero.");
    if (input.courierFeeSats < 0) return fail("Courier fee cannot be negative.");
    const network = (localStorage.getItem("proofdrop.live.network") as "chipnet" | "mainnet") ?? "chipnet";

// party keys (demo custody) + treasury/funder key
const buyerPriv = generatePrivateKey();
const sellerPriv = generatePrivateKey();
const courierPriv = generatePrivateKey();
const funderPriv = localStorage.getItem("proofdrop.live.treasury.key");
if (!funderPriv) return fail("Live mode needs a funded treasury wallet first (Settings > Live treasury).");

const buyerPk = secp256k1.derivePublicKeyCompressed(buyerPriv) as Uint8Array;
const sellerPk = secp256k1.derivePublicKeyCompressed(sellerPriv) as Uint8Array;
const courierPk = secp256k1.derivePublicKeyCompressed(courierPriv) as Uint8Array;

const deadlineSeconds = Math.max(600, Math.floor((new Date(input.deadline).getTime() - Date.now()) / 1000));
const refundDeadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
const FALLBACK_UNITS = 338; // 48h+, matches contracts/src/params.ts relativeTimeAge
const fallbackAge = BigInt((1 << 22) | FALLBACK_UNITS);

const params: ProofDropParams = {
  buyerPk, sellerPk, courierPk,
  buyerLockingBytecode: p2pkhBytecode(buyerPk),
  sellerLockingBytecode: p2pkhBytecode(sellerPk),
  courierLockingBytecode: p2pkhBytecode(courierPk),
  sellerAmount: BigInt(input.itemSats),
  courierFee: BigInt(input.courierFeeSats),
  refundDeadline, fallbackAge,
};

const state: LiveState = {
  network,
  params: serializeParams(params),
  escrowAddress: "",
  collectedAddress: "",
  principal: (params.sellerAmount + params.courierFee).toString(),
  keys: { buyer: binToHex(buyerPriv), seller: binToHex(sellerPriv), courier: binToHex(courierPriv), funder: funderPriv },
};
const built = buildFromState(state);
state.escrowAddress = built.escrow.address;
state.collectedAddress = built.collected.address;

const order: Order = {
  ...input,
  id: `PD-${rand(6)}`,
  status: "initial",
  createdAt: new Date().toISOString(),
  dispatched: false,
  deliveryCode: rand(6, "0123456789"),
  codeUsed: false,
  events: [],
};
saveLive(order.id, state);
return {
  ok: true,
  order: {
    ...order,
    status: "order_created",
    events: [ev("buyer", `Order created (live ${network}). Escrow: ${state.escrowAddress}`)],
  },
};

  },

  async fundSettlement(order, actor) {
    if (actor !== "buyer") return fail("Only the buyer can fund the settlement.");
    if (order.status !== "order_created") return fail("This settlement has already been funded.");
    const state = loadLive(order.id);
    if (!state) return fail("Live state missing for this order.");
    if (state.escrowTxid) return fail("Already funded on-chain.");
    const { provider, escrow, principal } = buildFromState(state);

const funderPriv = hexToBin(state.keys.funder);
const treasuryAddr = localStorage.getItem("proofdrop.live.treasury.addr");
if (!treasuryAddr) return fail("Treasury address not set up.");
const utxos = await provider.getUtxos(treasuryAddr);
const total = utxos.reduce((s, u) => s + u.satoshis, 0n);
const FEE = 2000n;
if (total < principal + FEE) return fail(`Treasury has ${total} sats; needs ${principal + FEE}.`);

const signer = new SignatureTemplate(funderPriv);
const tb = new TransactionBuilder({ provider });
for (const u of utxos) tb.addInput(u, signer.unlockP2PKH());
tb.addOutput({ to: escrow.address as any, amount: principal });
const change = total - principal - FEE;
if (change > 0n) tb.addOutput({ to: treasuryAddr as any, amount: change });
const tx = await tb.send();

state.escrowTxid = tx.txid;
saveLive(order.id, state);
return {
  ok: true,
  order: {
    ...order,
    status: "payment_locked",
    events: [...order.events, ev("buyer", "Payment locked in escrow contract", tx.txid)],
  },
};

  },

  async confirmCollection(order, actor) {
    if (actor !== "courier") return fail("Only the courier can confirm collection.");
    if (idx(order) < at("payment_locked")) return fail("Collection cannot be confirmed before payment is locked.");
    if (order.status === "refunded") return fail("This order was refunded.");
    if (idx(order) >= at("collection_confirmed")) return fail("Collection has already been confirmed.");
    const state = loadLive(order.id);
    if (!state || !state.escrowTxid) return fail("Escrow not funded yet.");
    const { provider, escrow, collected, principal } = buildFromState(state);

const escrowUtxos = await provider.getUtxos(escrow.address);
const escrowUtxo = escrowUtxos.find((u) => u.satoshis === principal);
if (!escrowUtxo) return fail("Escrow UTXO not found yet; wait for confirmation and retry.");

const funderPriv = hexToBin(state.keys.funder);
const treasuryAddr = localStorage.getItem("proofdrop.live.treasury.addr");
const feeUtxo = treasuryAddr ? (await provider.getUtxos(treasuryAddr)).sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0] : null;
if (!feeUtxo) return fail("Treasury has no UTXO for the fee.");
const FEE = 2000n;
const fee = { utxo: feeUtxo, signer: new SignatureTemplate(funderPriv), changeTo: hexToBin(state.params.buyerLockingBytecode), fee: FEE };

const courier = new SignatureTemplate(hexToBin(state.keys.courier));
const tb = buildCollect({
  provider, escrow, escrowUtxo, courier,
  to: hexToBin(collected.lockingBytecode),
  amount: principal, fee,
});
const tx = await tb.send();

state.collectTxid = tx.txid;
saveLive(order.id, state);
return {
  ok: true,
  order: {
    ...order,
    status: "collection_confirmed",
    events: [...order.events, ev("courier", "Courier-confirmed collection (on-chain)", tx.txid)],
  },
};

  },

  async confirmDelivery(order, actor, code) {
    if (actor !== "buyer") return fail("Delivery is confirmed by the buyer, not the courier or seller.");
    if (idx(order) < at("collection_confirmed")) return fail("Delivery cannot be confirmed before courier collection.");
    if (order.codeUsed) return fail("This delivery code has already been used.");
    if (!/^\d{6}$/.test(code.trim()) || code.trim() !== order.deliveryCode) return fail("That delivery code does not match this order.");
    // Delivery is an app-level attestation; the on-chain release follows.
    return {
      ok: true,
      order: {
        ...order,
        status: "delivery_confirmed",
        codeUsed: true,
        events: [...order.events, ev("buyer", "Buyer confirmed delivery with the code")],
      },
    };
  },

  async releaseSettlement(order, actor) {
    if (order.status === "settlement_released") return fail("Settlement has already been released.");
    if (order.status === "refunded") return fail("This order was refunded; nothing to release.");
    if (idx(order) < at("delivery_confirmed")) return fail("Payment remains locked until delivery is confirmed.");
    if (actor !== "buyer") return fail("Payment remains locked until the buyer approves the release.");
    const state = loadLive(order.id);
    if (!state || !state.collectTxid) return fail("Collection has not been confirmed on-chain yet.");
    const { provider, collected, p } = buildFromState(state);

const principal = BigInt(state.principal);
const colUtxos = await provider.getUtxos(collected.address);
const colUtxo = colUtxos.find((u) => u.satoshis === principal);
if (!colUtxo) return fail("CollectedContract UTXO not found yet; wait for confirmation and retry.");

const funderPriv = hexToBin(state.keys.funder);
const treasuryAddr = localStorage.getItem("proofdrop.live.treasury.addr");
const feeUtxo = treasuryAddr ? (await provider.getUtxos(treasuryAddr)).sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0] : null;
if (!feeUtxo) return fail("Treasury has no UTXO for the fee.");
const FEE = 2000n;
const fee = { utxo: feeUtxo, signer: new SignatureTemplate(funderPriv), changeTo: p.buyerLockingBytecode, fee: FEE };

const buyer = new SignatureTemplate(hexToBin(state.keys.buyer));
const tb = buildRelease({
  provider, collected, utxo: colUtxo, buyer,
  seller: { to: p.sellerLockingBytecode, amount: p.sellerAmount },
  courier: { to: p.courierLockingBytecode, amount: p.courierFee },
  fee,
});
const tx = await tb.send();

state.releaseTxid = tx.txid;
saveLive(order.id, state);
return {
  ok: true,
  order: {
    ...order,
    status: "settlement_released",
    events: [...order.events, ev("buyer", "Settlement released on-chain: seller and courier paid", tx.txid)],
  },
};

  },

  async requestRefund(order, actor, now = new Date()) {
    if (actor !== "buyer") return fail("Only the buyer can request a refund.");
    const eligibility = refundEligibility(order, now);
    if (!eligibility.allowed) return fail(eligibility.reason);
    const state = loadLive(order.id);
    if (!state || !state.escrowTxid) return fail("Escrow not funded yet.");
    if (state.refundTxid) return fail("Refund already broadcast.");
    const { provider, escrow, p } = buildFromState(state);

const principal = BigInt(state.principal);
const escrowUtxos = await provider.getUtxos(escrow.address);
const escrowUtxo = escrowUtxos.find((u) => u.satoshis === principal);
if (!escrowUtxo) return fail("Escrow UTXO not found; wait for confirmation and retry.");

const funderPriv = hexToBin(state.keys.funder);
const treasuryAddr = localStorage.getItem("proofdrop.live.treasury.addr");
const feeUtxo = treasuryAddr ? (await provider.getUtxos(treasuryAddr)).sort((a, b) => Number(b.satoshis) - Number(a.satoshis))[0] : null;
if (!feeUtxo) return fail("Treasury has no UTXO for the fee.");
const FEE = 2000n;

const buyer = new SignatureTemplate(hexToBin(state.keys.buyer));
const tb = buildRefund({
  provider, escrow, escrowUtxo, buyer,
  to: p.buyerLockingBytecode, amount: principal,
  locktime: Number(p.refundDeadline), fee: undefined,
});
// fee paid from the treasury as a second input
tb.addInput(feeUtxo, new SignatureTemplate(funderPriv).unlockP2PKH());
const feeChange = feeUtxo.satoshis - FEE;
if (feeChange > 0n) tb.addOutput({ to: treasuryAddr as any, amount: feeChange });
const tx = await tb.send();

state.refundTxid = tx.txid;
saveLive(order.id, state);
return {
  ok: true,
  order: {
    ...order,
    status: "refunded",
    events: [...order.events, ev("buyer", "Refunded on-chain: principal returned to buyer", tx.txid)],
  },
};

  },

  getSettlementStatus: (order) => order.status,
};

// Unused placeholder to keep the addressOf helper honest if reused later.
void addressOf;
