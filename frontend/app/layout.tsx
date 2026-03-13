import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GTC Isaac Lab GPU Training Demo",
  description: "Train a robot hand with GPU-accelerated reinforcement learning",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" style={{ colorScheme: "dark" }}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
