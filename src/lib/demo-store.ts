import { useSyncExternalStore } from "react";
import { settlement, type Actor, type Order, type OrderInput, type Result } from "./settlement";

// Local demo persistence (browser only). Holds simulated orders, never real payments.
const KEY = "proofdrop.demo.v1";
type State = { orders: Record<string, Order>; draft: OrderInput | null };
const EMPTY: State = { orders: {}, draft: null };

let state: State = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    state = EMPTY;
  }
}
function set(next: State) {
  state = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
const subscribe = (fn: () => void) => {
  load();
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useDemo() {
  return useSyncExternalStore(subscribe, () => (load(), state), () => EMPTY);
}
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

export const demo = {
  setDraft(draft: OrderInput | null) {
    set({ ...state, draft });
  },
  async create(): Promise<Result> {
    if (!state.draft) return { ok: false, reason: "No order draft to create." };
    const r = await settlement.createSettlement(state.draft);
    if (r.ok) set({ orders: { ...state.orders, [r.order.id]: r.order }, draft: null });
    return r;
  },
  async run(id: string, fn: (o: Order) => Promise<Result>): Promise<Result> {
    const o = state.orders[id];
    if (!o) return { ok: false, reason: "Order not found." };
    const r = await fn(o);
    if (r.ok) set({ ...state, orders: { ...state.orders, [id]: r.order } });
    return r;
  },
  // Seller dispatch is a coordination event, not a settlement state change.
  async dispatch(id: string, actor: Actor): Promise<Result> {
    return demo.run(id, async (o) => {
      if (actor !== "seller") return { ok: false, reason: "Only the seller can confirm dispatch." };
      if (o.status !== "payment_locked")
        return {
          ok: false,
          reason: o.status === "order_created" ? "Wait until the buyer has locked payment before dispatching." : "Dispatch is no longer applicable at this stage.",
        };
      if (o.dispatched) return { ok: false, reason: "Dispatch was already confirmed." };
      return {
        ok: true,
        order: { ...o, dispatched: true, events: [...o.events, { at: new Date().toISOString(), actor: "seller", label: "Seller confirmed dispatch to courier" }] },
      };
    });
  },
  reset() {
    set(EMPTY);
  },
};
