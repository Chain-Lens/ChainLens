"use client";

import Link from "next/link";
import Image from "next/image";
import ConnectButton from "../shared/ConnectButton";
import { useTheme } from "@/providers/ThemeProvider";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

const NAV_LINKS = [
  { href: "/discover", label: "Discover" },
  { href: "/register", label: "Sell API" },
  { href: "/seller",   label: "My APIs" },
  { href: "/docs",     label: "Docs" },
];

export default function Header() {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg2)] backdrop-blur-[8px]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">

          {/* Logo */}
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2 text-base font-bold tracking-tight"
              style={{ color: "var(--text)" }}
            >
              <Image src="/chainlens_coin_256.png" alt="ChainLens" width={24} height={24} />
              ChainLens
            </Link>

            {/* Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text2)] transition-colors hover:bg-[var(--bg3)] hover:text-[var(--text)]"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[8px] border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)] transition-colors hover:bg-[var(--border)] hover:text-[var(--text)]"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>

            <ConnectButton />
          </div>
        </div>
      </div>
    </header>
  );
}
