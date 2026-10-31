import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

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