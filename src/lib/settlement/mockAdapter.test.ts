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
