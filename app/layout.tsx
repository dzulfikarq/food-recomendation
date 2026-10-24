import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap"
});

export const metadata: Metadata = {
  title: { default: "FoodRec — Temukan makanan sesuai selera", template: "%s | FoodRec" },
  description: "Fondasi sistem rekomendasi makanan berbasis pola rating pengguna."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${jakartaSans.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
