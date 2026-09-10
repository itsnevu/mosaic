import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Mosaic Capital — Vault",
  description: "Deposit USDG, receive mUSDG shares. Allocation, price per share and your position, live from chain.",
};

export default function AppPage() {
  return <Dashboard />;
}
