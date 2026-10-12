import type { ReactNode } from "react";

export const metadata = { title: "Ledgerly", description: "Simple invoices" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 40 }}>{children}</body>
    </html>
  );
}
