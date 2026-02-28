import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "COIL",
  description: "Daily Territory Tracker & Journal",
  icons: {
    icon: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#1a1a18",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var t = localStorage.getItem('coil_theme') || 'system';
              var resolved = t === 'system'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : t;
              document.documentElement.setAttribute('data-theme', resolved);
            })();
          `
        }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
