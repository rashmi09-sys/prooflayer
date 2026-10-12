import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calculateTotal, formatCurrency } from "../src/lib/invoice.ts";

const items = [
  { description: "Design sprint", quantity: 2, unitPriceCents: 4000 },
  { description: "Hosting", quantity: 1, unitPriceCents: 2000 },
];

describe("invoice totals", () => {
  it("adds tax to the subtotal", () => {
    assert.equal(calculateTotal(items, 0.08), 10800);
  });

  it("formats the total for display", () => {
    assert.equal(formatCurrency(calculateTotal(items, 0.08)), "$108.00");
  });

  it("returns zero for an empty invoice", () => {
    assert.equal(formatCurrency(calculateTotal([], 0.08)), "$0.00");
  });
});
