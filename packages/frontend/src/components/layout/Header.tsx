"use client";

import Link from "next/link";
import ConnectButton from "../shared/ConnectButton";

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-primary-500">
              API Market
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/marketplace"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Marketplace
              </Link>
              <Link
                href="/register"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Sell API
              </Link>
              <Link
                href="/seller"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                My APIs
              </Link>
              <Link
                href="/docs"
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Docs
              </Link>
            </nav>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
