import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ChainLens - Agent API Marketplace",
  description:
    "Discover, buy, and use verified APIs with on-chain payments on Base",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Prevent flash of wrong theme before React hydrates */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t||'dark');})()`,
          }}
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
