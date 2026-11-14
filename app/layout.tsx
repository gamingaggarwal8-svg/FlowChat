import "./globals.css";
import type { ReactNode } from "react";
export const metadata = {
  title: "FlowChat — Your trading day, in view",
  description:
    "Inventory, suppliers and cash decisions, connected to your original business records.",
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
