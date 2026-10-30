import { describe, expect, it } from "vitest";
import { mockAdapter as a } from "./mockAdapter";
import type { Order, Result } from "./types";

const input = {
  item: "Used laptop", description: "", sellerName: "S", sellerAddress: "bitcoincash:s", buyerAddress: "bitcoincash:b",
  courierName: "C", courierAddress: "bitcoincash:c", itemSats: 1_500_000, courierFeeSats: 200_000,
  deadline: new Date(Date.now() + 864e5).toISOString(), method: "one_time_code" as const,
};
const ok = (r: Result): Order => { if (!r.ok) throw new Error(r.reason); return r.order; };

describe("mock settlement rules", () => {
  it("runs the full flow to release", async () => {
    let o = ok(await a.createSettlement(input));
    o = ok(await a.fundSettlement(o, "buyer"));
    o = ok(await a.confirmCollection(o, "courier"));
    o = ok(await a.confirmDelivery(o, "buyer", o.deliveryCode!));
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
    o = ok(await a.confirmDelivery(o, "buyer", o.deliveryCode!));
    expect((await a.confirmDelivery(o, "buyer", o.deliveryCode!)).ok).toBe(false);
    o = ok(await a.releaseSettlement(o, "buyer"));
    expect((await a.releaseSettlement(o, "buyer")).ok).toBe(false);
  });
});
