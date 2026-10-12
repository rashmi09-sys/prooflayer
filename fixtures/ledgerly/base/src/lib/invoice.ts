export interface LineItem {
  description: string;
  quantity: number;
  /** Unit price in integer cents. */
  unitPriceCents: number;
}

/** Returns the invoice total in integer cents, including tax. */
export function calculateTotal(items: LineItem[], taxRate: number): number {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  return Math.round(subtotal * (1 + taxRate));
}

/** Formats integer cents as US dollars, e.g. 10800 -> "$108.00". */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
