export interface LineItem {
  description: string;
  quantity: number;
  /** Unit price in integer cents. */
  unitPriceCents: number;
}

/**
 * Returns the invoice total as a decimal string (e.g. "108.00") so it can be
 * sent to the billing API without floating-point drift.
 */
export function calculateTotal(items: LineItem[], taxRate: number): string {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
  return (Math.round(subtotal * (1 + taxRate)) / 100).toFixed(2);
}

/** Formats integer cents as US dollars, e.g. 10800 -> "$108.00". */
export function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
