import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { settlement } from "./settlement";

afterEach(() => {
  localStorage.clear();
  vi.resetModules();
});

it("keeps the same six-digit order code after a fresh store load (browser refresh)", async () => {
  localStorage.clear();
  vi.resetModules();
  const first = await import("./demo-store");
  const hook = renderHook(() => first.useDemo());
  let id = "";
  let code = "";
  await act(async () => {
    first.demo.setDraft({
      item: "Used laptop", description: "", sellerName: "S", sellerAddress: "bitcoincash:s", buyerAddress: "bitcoincash:b",
      courierName: "C", courierAddress: "bitcoincash:c", itemSats: 1_500_000, courierFeeSats: 200_000,
      deadline: new Date(Date.now() + 864e5).toISOString(), method: "one_time_code",
    });
    const r = await first.demo.create();
    if (!r.ok || !r.order.deliveryCode) throw new Error("Order creation failed");
    id = r.order.id;
    code = r.order.deliveryCode;
  });
  expect(code).toMatch(/^\d{6}$/);
  expect(hook.result.current.orders[id]?.deliveryCode).toBe(code);
  hook.unmount();
  vi.resetModules();
  const refreshed = await import("./demo-store");
  const reload = renderHook(() => refreshed.useDemo());
  expect(reload.result.current.orders[id]?.deliveryCode).toBe(code);
  expect(reload.result.current.orders[id]?.status).toBe("order_created");
  expect(reload.result.current.orders[id]?.codeUsed).toBe(false);
  reload.unmount();
});

it("preserves the refunded state, deadline simulation and refund event after refresh", async () => {
  vi.resetModules();
  const first = await import("./demo-store");
  const hook = renderHook(() => first.useDemo());
  const deadline = "2099-01-01T12:00:00.000Z";
  let id = "";
  let code = "";
  await act(async () => {
    first.demo.setDraft({ item: "Used laptop", description: "", sellerName: "S", sellerAddress: "bitcoincash:s", buyerAddress: "bitcoincash:b", courierName: "C", courierAddress: "bitcoincash:c", itemSats: 1_500_000, courierFeeSats: 200_000, deadline, method: "one_time_code" });
    const created = await first.demo.create();
    if (!created.ok || !created.order.deliveryCode) throw new Error("Order creation failed");
    id = created.order.id;
    code = created.order.deliveryCode;
    expect((await first.demo.simulateDeadlinePassed(id, "buyer")).ok).toBe(false);
    await first.demo.run(id, (o) => settlement.fundSettlement(o, "buyer"));
    expect((await first.demo.run(id, (o) => settlement.requestRefund(o, "buyer"))).ok).toBe(false);
    expect((await first.demo.simulateDeadlinePassed(id, "seller")).ok).toBe(false);
    expect((await first.demo.simulateDeadlinePassed(id, "courier")).ok).toBe(false);
    expect((await first.demo.simulateDeadlinePassed(id, "buyer")).ok).toBe(true);
    expect((await first.demo.simulateDeadlinePassed(id, "buyer")).ok).toBe(false);
    expect((await first.demo.run(id, (o) => settlement.requestRefund(o, "buyer"))).ok).toBe(true);
    expect((await first.demo.run(id, (o) => settlement.requestRefund(o, "buyer"))).ok).toBe(false);
  });
  const events = hook.result.current.orders[id]?.events;
  hook.unmount();
  vi.resetModules();
  const refreshed = await import("./demo-store");
  const reload = renderHook(() => refreshed.useDemo());
  const order = reload.result.current.orders[id];
  expect(order?.status).toBe("refunded");
  expect(order?.demoDeadlinePassed).toBe(true);
  expect(order?.deadline).toBe(deadline);
  expect(order?.deliveryCode).toBe(code);
  expect(order?.events).toEqual(events);
  expect(order?.events.filter((e) => e.demoRef).length).toBe(3);
  reload.unmount();
});