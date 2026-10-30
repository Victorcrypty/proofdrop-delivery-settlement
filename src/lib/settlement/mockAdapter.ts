import type { Actor, Order, OrderInput, Result, SettlementAdapter } from "./types";
import { STATUS_ORDER } from "./types";

// LOCAL MOCK ADAPTER — moves no funds and touches no blockchain.
// Every reference it produces is a "Demo reference" (DEMO-… prefix), never a txid.
//
// To go live, implement SettlementAdapter in e.g. ./bchAdapter.ts or ./xoAdapter.ts:
//  - createSettlement  -> build the covenant / escrow contract (CashScript) for
//                          buyer, seller, courier addresses and amounts
//  - fundSettlement    -> request the buyer's wallet to fund the contract address
//                          (wallet signs; ProofDrop never sees private keys)
//  - confirmCollection -> courier-signed collection attestation
//  - confirmDelivery   -> buyer-signed delivery attestation (one-time code hash)
//  - releaseSettlement -> spend contract to seller + courier outputs
//  - requestRefund     -> timelocked refund path back to buyer
// Then swap the export in ./index.ts. No UI changes required.

const rand = (n: number, chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789") =>
  Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

export const demoRef = () => `DEMO-${rand(4)}-${rand(4)}`;

const idx = (o: Order) => STATUS_ORDER.indexOf(o.status);
const at = (s: Order["status"]) => STATUS_ORDER.indexOf(s);
const fail = (reason: string): Result => ({ ok: false, reason });

function step(order: Order, status: Order["status"], actor: Actor, label: string, patch: Partial<Order> = {}): Result {
  return {
    ok: true,
    order: {
      ...order,
      ...patch,
      status,
      events: [...order.events, { at: new Date().toISOString(), actor, label, demoRef: demoRef() }],
    },
  };
}

export const mockAdapter: SettlementAdapter = {
  mode: "demo",

  async createSettlement(input: OrderInput) {
    if (input.itemSats <= 0) return fail("Item amount must be greater than zero.");
    if (input.courierFeeSats < 0) return fail("Courier fee cannot be negative.");
    const order: Order = {
      ...input,
      id: `PD-${rand(6)}`,
      status: "initial",
      createdAt: new Date().toISOString(),
      dispatched: false,
      deliveryCode: null,
      codeUsed: false,
      events: [],
    };
    return step(order, "order_created", "buyer", "Order created");
  },

  async fundSettlement(order, actor) {
    if (actor !== "buyer") return fail("Only the buyer can fund the settlement.");
    if (order.status !== "order_created") return fail("This settlement has already been funded.");
    return step(order, "payment_locked", "buyer", "Payment locked (simulated)", {
      deliveryCode: rand(6, "0123456789"),
    });
  },

  async confirmCollection(order, actor) {
    if (actor !== "courier") return fail("Only the courier can confirm collection.");
    if (idx(order) < at("payment_locked"))
      return fail("Collection cannot be confirmed because payment has not been locked yet.");
    if (order.status === "refunded") return fail("This order was refunded.");
    if (idx(order) >= at("collection_confirmed")) return fail("Collection has already been confirmed.");
    return step(order, "collection_confirmed", "courier", "Courier-confirmed collection");
  },

  async confirmDelivery(order, actor, code) {
    if (idx(order) < at("collection_confirmed"))
      return fail("Delivery cannot be confirmed before courier collection is confirmed.");
    if (actor !== "buyer") return fail("Delivery is confirmed by the buyer, not the courier or seller.");
    if (order.codeUsed) return fail("This delivery code has already been used. It cannot be used twice.");
    if (code.trim() !== order.deliveryCode) return fail("That delivery code does not match this order.");
    return step(order, "delivery_confirmed", "buyer", "Buyer-confirmed delivery", { codeUsed: true });
  },

  async releaseSettlement(order, actor) {
    if (order.status === "settlement_released") return fail("Settlement has already been released. It cannot be released twice.");
    if (order.status === "refunded") return fail("This order was refunded; nothing to release.");
    if (actor !== "buyer") {
      if (idx(order) < at("delivery_confirmed"))
        return fail(
          idx(order) < at("collection_confirmed")
            ? "Payment remains locked because courier collection has not been confirmed."
            : "Payment remains locked because the buyer has not confirmed delivery.",
        );
      return fail("Payment remains locked until the buyer approves the release.");
    }
    if (idx(order) < at("collection_confirmed"))
      return fail("Payment remains locked because courier collection has not been confirmed.");
    if (idx(order) < at("delivery_confirmed"))
      return fail("Payment remains locked because delivery has not been confirmed with the delivery code.");
    return step(order, "settlement_released", "buyer", "Settlement released (simulated)");
  },

  async requestRefund(order, actor, now = new Date()) {
    if (actor !== "buyer") return fail("Only the buyer can request a refund.");
    if (order.status !== "payment_locked")
      return fail(
        idx(order) < at("payment_locked")
          ? "There is no locked payment to refund."
          : "A refund is not available because collection was already confirmed.",
      );
    if (now.getTime() < new Date(order.deadline).getTime())
      return fail("A refund can only be requested after the delivery deadline passes without collection.");
    return step(order, "refunded", "buyer", "Refund issued (simulated)");
  },

  getSettlementStatus: (order) => order.status,
};
