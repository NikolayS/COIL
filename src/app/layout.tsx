import type { Metadata } from "next";
import { Playfair_Display, DM_Mono, Inter } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "COIL",
  description: "Daily Territory Tracker & Journal",
  manifest: "/manifest.json",
  themeColor: "#1a1a18",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${playfair.variable} ${dmMono.variable} ${inter.variable}`}>
      <body className="bg-[#1a1a18] text-[#e8e0d0] min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
