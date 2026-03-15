import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "COIL",
  description: "Daily Territory Tracker & Journal",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "COIL",
  },
  icons: {
    icon: "/favicon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#1a1a18' },
    { media: '(prefers-color-scheme: light)', color: '#f5f2ec' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        {/* Next.js emits mobile-web-app-capable (Chrome Android) instead of
            apple-mobile-web-app-capable (iOS Safari). Add it explicitly so
            "Add to Home Screen" on iOS opens in standalone mode, not Safari. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              var t = localStorage.getItem('coil_theme') || 'system';
              var resolved = t === 'system'
                ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
                : t;
              document.documentElement.setAttribute('data-theme', resolved);
            })();
            (function() {
              try {
                fetch('/api/version',{cache:'no-store'}).then(function(r){return r.json()}).then(function(d){
                  var k='coil_version',prev=localStorage.getItem(k);
                  localStorage.setItem(k,d.v);
                  if(prev&&prev!==d.v){location.reload()}
                }).catch(function(){});
              } catch(e){}
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
