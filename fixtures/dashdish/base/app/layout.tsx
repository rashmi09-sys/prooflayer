import type { ReactNode } from "react";
import "./globals.css";

export const metadata = { title: "DashDish", description: "Food you love, delivered." };
export const viewport = { width: "device-width", initialScale: 1, themeColor: "#121317" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
