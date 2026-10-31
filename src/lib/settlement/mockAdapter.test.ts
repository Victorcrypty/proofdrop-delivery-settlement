import { describe, expect, it } from "vitest";
import { mockAdapter as a } from "./mockAdapter";
import type { Order, Result } from "./types";

const input = {
  item: "Used laptop", description: "", sellerName: "S", sellerAddress: "bitcoincash:s", buyerAddress: "bitcoincash:b",
  courierName: "C", courierAddress: "bitcoincash:c", itemSats: 1_500_000, courierFeeSats: 200_000,
  deadline: new Date(Date.now() + 864e5).toISOString(), method: "one_time_code" as const,
};
const ok = (r: Result): Order => { if (!r.ok) throw new Error(r.reason); return r.order; };
const codeOf = (o: Order): string => { if (!o.deliveryCode) throw new Error("Missing delivery code"); return o.deliveryCode; };

describe("mock settlement rules", () => {
  const deadline = "2026-10-31T12:00:00.000Z";
  const before = new Date("2026-10-31T11:59:59.000Z");
  const after = new Date("2026-10-31T12:00:01.000Z");
  const locked = async () => ok(await a.fundSettlement(ok(await a.createSettlement({ ...input, deadline })), "buyer"));

  it("blocks refunds before and exactly at the deadline", async () => {
    const o = await locked();
    expect(await a.requestRefund(o, "buyer", before)).toEqual({ ok: false, reason: "Refund unavailable until the delivery deadline passes." });
    expect((await a.requestRefund(o, "buyer", new Date(deadline))).ok).toBe(false);
    expect(o.status).toBe("payment_locked");
  });
  it("refunds after deadline without collection and records a demo reference", async () => {
    const o = await locked();
    const refunded = ok(await a.requestRefund(o, "buyer", after));
    expect(refunded.status).toBe("refunded");
    expect(refunded.events.at(-1)?.actor).toBe("buyer");
    expect(refunded.events.at(-1)?.demoRef).toMatch(/^DEMO-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(refunded.deliveryCode).toBe(o.deliveryCode);
    expect(refunded.itemSats + refunded.courierFeeSats).toBe(1_700_000);
  });
  it("blocks refund after collection even with simulated deadline", async () => {
    const o = ok(await a.confirmCollection({ ...await locked(), demoDeadlinePassed: true }, "courier"));
    expect(await a.requestRefund(o, "buyer", after)).toEqual({ ok: false, reason: "Refund unavailable because courier collection has already been confirmed." });
  });
  it("blocks refund after settlement release", async () => {
    let o = ok(await a.confirmCollection(await locked(), "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", codeOf(o)));
    o = ok(await a.releaseSettlement(o, "buyer"));
    expect(await a.requestRefund(o, "buyer", after)).toEqual({ ok: false, reason: "Refund unavailable because settlement has already been released." });
  });
  it("blocks duplicate refund without adding a second event", async () => {
    const o = ok(await a.requestRefund(await locked(), "buyer", after));
    const count = o.events.length;
    expect(await a.requestRefund(o, "buyer", after)).toEqual({ ok: false, reason: "This order has already been refunded. A refund cannot be executed twice." });
    expect(o.events.length).toBe(count);
    expect((await a.releaseSettlement(o, "buyer")).ok).toBe(false);
    expect((await a.confirmCollection(o, "courier")).ok).toBe(false);
    expect((await a.confirmDelivery(o, "buyer", codeOf(o))).ok).toBe(false);
  });
  it("allows local simulated deadline without mutating the agreed deadline", async () => {
    const o = { ...await locked(), demoDeadlinePassed: true };
    expect(ok(await a.requestRefund(o, "buyer", before)).status).toBe("refunded");
    expect(o.deadline).toBe(deadline);
  });
  it("blocks seller and courier refunds even after deadline", async () => {
    const o = await locked();
    for (const role of ["seller", "courier"] as const)
      expect(await a.requestRefund(o, role, after)).toEqual({ ok: false, reason: "Only the buyer can request a refund." });
  });
  it("blocks refunds when no payment is locked", async () => {
    const o = ok(await a.createSettlement({ ...input, deadline }));
    expect(await a.requestRefund(o, "buyer", after)).toEqual({ ok: false, reason: "There is no locked payment to refund." });
  });
  it("runs the full flow to release", async () => {
    let o = ok(await a.createSettlement(input));
    o = ok(await a.fundSettlement(o, "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", codeOf(o)));
    o = ok(await a.releaseSettlement(o, "buyer"));
    expect(o.status).toBe("settlement_released");
    expect(o.events.every((e) => e.demoRef?.startsWith("DEMO-"))).toBe(true);
  });
  it("blocks seller claim while locked", async () => {
    let o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    const r = await a.releaseSettlement(o, "seller");
    expect(r).toEqual({ ok: false, reason: "Payment remains locked because courier collection has not been confirmed." });
  });
  it("blocks courier delivery before collection and buyer release before collection", async () => {
    const o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    expect((await a.confirmDelivery(o, "courier", "x")).ok).toBe(false);
    expect((await a.releaseSettlement(o, "buyer")).ok).toBe(false);
  });
  it("rejects code reuse and double release", async () => {
    let o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", codeOf(o)));
    expect((await a.confirmDelivery(o, "buyer", codeOf(o))).ok).toBe(false);
    o = ok(await a.releaseSettlement(o, "buyer"));
    expect((await a.releaseSettlement(o, "buyer")).ok).toBe(false);
  });
  it("creates one six-digit code and preserves it through settlement transitions", async () => {
    let o = ok(await a.createSettlement(input));
    const code = codeOf(o);
    expect(code).toMatch(/^\d{6}$/);
    o = ok(await a.fundSettlement(o, "buyer"));
    expect(o.deliveryCode).toBe(code);
    o = ok(await a.confirmCollection(o, "courier"));
    expect(o.deliveryCode).toBe(code);
    o = ok(await a.confirmDelivery(o, "buyer", code));
    o = ok(await a.releaseSettlement(o, "buyer"));
    expect(o.deliveryCode).toBe(code);
  });
  it("rejects a wrong code after collection", async () => {
    let o = ok(await a.createSettlement(input));
    o = ok(await a.fundSettlement(o, "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    const wrong = codeOf(o) === "000000" ? "111111" : "000000";
    expect(await a.confirmDelivery(o, "buyer", wrong)).toEqual({ ok: false, reason: "That delivery code does not match this order." });
    expect(o.codeUsed).toBe(false);
  });
  it("rejects the correct code before payment is locked", async () => {
    const o = ok(await a.createSettlement(input));
    expect(await a.confirmDelivery(o, "buyer", codeOf(o))).toEqual({ ok: false, reason: "Delivery cannot be confirmed before courier collection is confirmed." });
    expect(o.codeUsed).toBe(false);
  });
  it("rejects the correct code before courier collection", async () => {
    const o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    expect(await a.confirmDelivery(o, "buyer", codeOf(o))).toEqual({ ok: false, reason: "Delivery cannot be confirmed before courier collection is confirmed." });
    expect(o.codeUsed).toBe(false);
  });
  it("accepts the correct code after payment lock and collection", async () => {
    let o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", codeOf(o)));
    expect(o.status).toBe("delivery_confirmed");
    expect(o.codeUsed).toBe(true);
  });
  it("rejects the same code a second time", async () => {
    let o = ok(await a.fundSettlement(ok(await a.createSettlement(input)), "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", codeOf(o)));
    expect(await a.confirmDelivery(o, "buyer", codeOf(o))).toEqual({ ok: false, reason: "This delivery code has already been used. It cannot be used twice." });
  });
});
