import type { Dish } from "./menu.ts";

export interface CartLine {
  /** One line per dish and set of choices. */
  key: string;
  dishId: string;
  name: string;
  /** The chosen size and add-ons, for display. Empty for the default. */
  options: string;
  /** Unit price in integer cents. */
  price: number;
  quantity: number;
  restaurantId: string;
}

export interface Totals {
  subtotal: number;
  delivery: number;
  discount: number;
  total: number;
}

export const COUPONS: Record<string, { label: string; percentOff?: number; freeDelivery?: boolean }> = {
  WELCOME10: { label: "10% off your order", percentOff: 10 },
  FREEDEL: { label: "Free delivery", freeDelivery: true },
};

export type Size = "small" | "medium" | "large";

/** Price change per size, in cents. Medium is the menu price. */
export const SIZES: { id: Size; label: string; delta: number }[] = [
  { id: "small", label: "Small", delta: -200 },
  { id: "medium", label: "Medium", delta: 0 },
  { id: "large", label: "Large", delta: 300 },
];

export const ADD_ONS: { id: string; label: string; price: number }[] = [
  { id: "cheese", label: "Extra cheese", price: 150 },
  { id: "chili", label: "Chili oil", price: 75 },
  { id: "dip", label: "Garlic dip", price: 100 },
];

export interface Choice {
  size: Size;
  addOns: string[];
}

export const DEFAULT_CHOICE: Choice = { size: "medium", addOns: [] };

/** Unit price of a dish with the given choices, in cents. */
export function unitPrice(dish: Dish, choice: Choice = DEFAULT_CHOICE): number {
  const size = SIZES.find((s) => s.id === choice.size)?.delta ?? 0;
  const extras = ADD_ONS.filter((a) => choice.addOns.includes(a.id)).reduce((n, a) => n + a.price, 0);
  return Math.max(0, dish.price + size + extras);
}

function describe(choice: Choice): string {
  const parts = [choice.size === "medium" ? null : SIZES.find((s) => s.id === choice.size)?.label, ...ADD_ONS.filter((a) => choice.addOns.includes(a.id)).map((a) => a.label)];
  return parts.filter(Boolean).join(" · ");
}

/** Adds a dish, merging quantities for the same dish and choices. Returns a new cart. */
export function addToCart(cart: CartLine[], dish: Dish, restaurantId: string, quantity = 1, choice: Choice = DEFAULT_CHOICE): CartLine[] {
  const addOns = [...choice.addOns].sort();
  const key = choice.size === "medium" && !addOns.length ? dish.id : `${dish.id}:${choice.size}:${addOns.join("+")}`;
  const existing = cart.find((l) => l.key === key);
  if (existing) return cart.map((l) => (l.key === key ? { ...l, quantity: l.quantity + quantity } : l));
  return [...cart, { key, dishId: dish.id, name: dish.name, options: describe({ size: choice.size, addOns }), price: unitPrice(dish, { size: choice.size, addOns }), quantity, restaurantId }];
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  return quantity <= 0 ? cart.filter((l) => l.key !== key) : cart.map((l) => (l.key === key ? { ...l, quantity } : l));
}

export function itemCount(cart: CartLine[]): number {
  return cart.reduce((n, l) => n + l.quantity, 0);
}

export function normalizeCoupon(code: string): string | null {
  const c = code.trim().toUpperCase();
  return c in COUPONS ? c : null;
}

/** Totals in integer cents. Delivery is a flat fee per order. */
export function cartTotals(cart: CartLine[], deliveryFee: number, coupon: string | null): Totals {
  const subtotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);
  const rule = coupon ? COUPONS[coupon] : undefined;
  const delivery = cart.length === 0 || rule?.freeDelivery ? 0 : deliveryFee;
  const discount = rule?.percentOff ? Math.round((subtotal * rule.percentOff) / 100) : 0;
  return { subtotal, delivery, discount, total: subtotal + delivery - discount };
}
