import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "TrustVault — Shared purpose. Independent authority.",
  description:
    "Synthetic conditional funding prototype for RMIT Hackathon 2026",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
