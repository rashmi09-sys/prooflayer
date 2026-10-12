import { calculateTotal, formatCurrency, type LineItem } from "@/lib/invoice";

const items: LineItem[] = [
  { description: "Design sprint", quantity: 2, unitPriceCents: 4000 },
  { description: "Hosting", quantity: 1, unitPriceCents: 2000 },
];

export default function InvoicePage() {
  const total = calculateTotal(items, 0.08);
  return (
    <main>
      <h1>Invoice #1042</h1>
      <ul>
        {items.map((item) => (
          <li key={item.description}>
            {item.quantity} × {item.description} — {formatCurrency(item.unitPriceCents)}
          </li>
        ))}
      </ul>
      <p>
        <strong>Total due: {formatCurrency(total)}</strong>
      </p>
    </main>
  );
}
