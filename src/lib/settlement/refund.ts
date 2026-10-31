import type { Order } from "./types";

// Local prototype clock override; the agreed deadline itself never changes.
export function refundEligibility(order: Order, now = new Date()): { allowed: boolean; reason: string } {
  if (order.status === "refunded")
    return { allowed: false, reason: "This order has already been refunded. A refund cannot be executed twice." };
  if (order.status === "settlement_released")
    return { allowed: false, reason: "Refund unavailable because settlement has already been released." };
  if (order.status === "collection_confirmed" || order.status === "delivery_confirmed")
    return { allowed: false, reason: "Refund unavailable because courier collection has already been confirmed." };
  if (order.status !== "payment_locked")
    return { allowed: false, reason: "There is no locked payment to refund." };
  const deadline = new Date(order.deadline).getTime();
  if (!Number.isFinite(deadline) || (!order.demoDeadlinePassed && now.getTime() <= deadline))
    return { allowed: false, reason: "Refund unavailable until the delivery deadline passes." };
  return { allowed: true, reason: "Buyer may request a refund because courier collection was not confirmed before the deadline." };
}