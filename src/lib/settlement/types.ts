// Settlement domain types. UI code depends only on these + the SettlementAdapter
// interface, never on a concrete adapter implementation.

export type SettlementStatus =
  | "initial"
  | "order_created"
  | "payment_locked"
  | "collection_confirmed"
  | "delivery_confirmed"
  | "settlement_released"
  | "refunded";

export type Actor = "buyer" | "seller" | "courier" | "system";

export interface OrderInput {
  item: string;
  description: string;
  sellerName: string;
  sellerAddress: string;
  buyerAddress: string;
  courierName: string;
  courierAddress: string;
  itemSats: number; // amounts held in satoshis to avoid float errors
  courierFeeSats: number;
  deadline: string; // ISO string
  method: "one_time_code";
}

export interface OrderEvent {
  at: string;
  actor: Actor;
  label: string;
  /** Simulated reference. Always rendered with the "Demo reference" label. */
  demoRef?: string;
}

export interface Order extends OrderInput {
  id: string;
  status: SettlementStatus;
  createdAt: string;
  dispatched: boolean;
  deliveryCode: string | null;
  codeUsed: boolean;
  /** Local prototype clock override. Never changes the agreed deadline. */
  demoDeadlinePassed?: boolean;
  events: OrderEvent[];
}

export type Result = { ok: true; order: Order } | { ok: false; reason: string };

export interface SettlementAdapter {
  /** Identifies whether this adapter moves real funds. The mock is always "demo". */
  readonly mode: "demo" | "live";
  createSettlement(input: OrderInput): Promise<Result>;
  fundSettlement(order: Order, actor: Actor): Promise<Result>;
  confirmCollection(order: Order, actor: Actor): Promise<Result>;
  confirmDelivery(order: Order, actor: Actor, code: string): Promise<Result>;
  releaseSettlement(order: Order, actor: Actor): Promise<Result>;
  requestRefund(order: Order, actor: Actor, now?: Date): Promise<Result>;
  getSettlementStatus(order: Order): SettlementStatus;
}

export const STATUS_ORDER: SettlementStatus[] = [
  "initial",
  "order_created",
  "payment_locked",
  "collection_confirmed",
  "delivery_confirmed",
  "settlement_released",
];
