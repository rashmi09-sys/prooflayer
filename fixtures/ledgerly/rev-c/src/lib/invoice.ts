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

/** Formats a money amount as US dollars. Accepts cents or decimal strings. */
export function formatCurrency(value: number | string): string {
  const cents = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
