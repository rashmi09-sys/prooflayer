import type { CartLine } from "./cart.ts";
import { cartTotals } from "./cart.ts";

export interface Delivery {
  type: "now" | "scheduled";
  /** Scheduled orders only: the day, e.g. "Tomorrow". */
  day?: string;
  /** Scheduled orders only: the delivery window, e.g. "18:00–19:00". */
  window?: string;
}

/** Windows customers can schedule for tomorrow. */
export const DELIVERY_WINDOWS = ["12:00–13:00", "18:00–19:00", "19:00–20:00", "20:00–21:00"];

export function isValidWindow(window?: string): boolean {
  return !!window && DELIVERY_WINDOWS.includes(window);
}

export interface OrderRequest {
  lines: CartLine[];
  coupon: string | null;
  deliveryFee: number;
  address: string;
  /** Estimated delivery time shown to the customer, from the restaurant. */
  eta: string;
  delivery: Delivery;
}

export type OrderResult =
  | { status: "confirmed"; id: string; total: number; eta: string; delivery: Delivery }
  | { status: "rejected"; reason: string };

/** Deterministic order number from the cart contents, e.g. DD-4821. */
export function orderNumber(lines: CartLine[]): string {
  let h = 7;
  for (const l of lines) for (const ch of `${l.dishId}x${l.quantity}`) h = (h * 31 + ch.charCodeAt(0)) % 9000;
  return `DD-${1000 + h}`;
}

/** Validates and confirms an order. No payment or logistics: a demo fixture. */
export function placeOrder(req: OrderRequest): OrderResult {
  if (req.lines.length === 0) return { status: "rejected", reason: "Your cart is empty" };
  if (!req.address.trim()) return { status: "rejected", reason: "Add a delivery address" };
  // Scheduled delivery: every order needs a valid delivery window.
  if (!isValidWindow(req.delivery.window)) return { status: "rejected", reason: "Choose a delivery time" };
  const { total } = cartTotals(req.lines, req.deliveryFee, req.coupon);
  return { status: "confirmed", id: orderNumber(req.lines), total, eta: req.eta, delivery: req.delivery };
}

/** The headline the app shows after the customer taps Place order. */
export function resultHeadline(result: OrderResult): string {
  if (result.status === "rejected") return result.reason;
  return result.delivery.type === "scheduled" ? "Order scheduled" : "Order confirmed";
}
