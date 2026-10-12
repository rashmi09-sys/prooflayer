import { calculateTotal, formatCurrency, type LineItem } from "@/lib/invoice";

const items: LineItem[] = [
  { description: "Design sprint", quantity: 2, unitPriceCents: 4000 },
  { description: "Hosting", quantity: 1, unitPriceCents: 2000 },
];
const TAX_RATE = 0.08;

export default function InvoicePage() {
  const total = calculateTotal(items, TAX_RATE);
  return (
    <main style={{ maxWidth: 560 }}>
      <p style={{ color: "#667", margin: 0 }}>Ledgerly</p>
      <h1 style={{ marginTop: 4 }}>Invoice #1042</h1>
      <p style={{ color: "#667" }}>Billed to Northwind Studio · Due 31 October</p>
      <ul style={{ paddingLeft: 18, lineHeight: 1.8 }}>
        {items.map((item) => (
          <li key={item.description}>
            {item.quantity} × {item.description} — {formatCurrency(item.unitPriceCents)}
          </li>
        ))}
      </ul>
      <details style={{ margin: "16px 0" }}>
        <summary style={{ cursor: "pointer" }}>Show breakdown</summary>
        <p>Tax rate: {Math.round(TAX_RATE * 100)}% · {items.length} line items</p>
      </details>
      <p style={{ fontSize: 28, margin: "24px 0 0" }}>
        <strong>Total due: {formatCurrency(total)}</strong>
      </p>
    </main>
  );
}
