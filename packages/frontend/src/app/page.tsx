"use client";

import Link from "next/link";
import { useRef } from "react";

export default function Home() {
  const howToRef = useRef<HTMLDivElement>(null);

  const scrollToHowTo = () => {
    howToRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <>
      {/* ── Section 1: Hero (full viewport) ── */}
      <section className="relative flex flex-col items-center justify-center min-h-[calc(100vh-64px)] text-center px-4">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">
          Agent API Marketplace
        </h1>
        <p className="text-xl text-gray-600 mb-4 max-w-2xl">
          Discover verified APIs. Pay on-chain. Get instant results.
        </p>
        <p className="text-lg text-gray-500 mb-10 max-w-xl">
          Built for AI agents and developers on Base
        </p>
        <div className="flex justify-center gap-4">
          <Link href="/marketplace" className="btn-primary text-lg px-8 py-3">
            Browse APIs
          </Link>
          <Link href="/register" className="btn-secondary text-lg px-8 py-3">
            Sell Your API
          </Link>
        </div>

        {/* Down arrow */}
        <button
          onClick={scrollToHowTo}
          aria-label="Scroll to How to use"
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-gray-400 hover:text-gray-600 transition-colors group"
        >
          <span className="text-xs tracking-widest uppercase font-medium">How to use</span>
          <svg
            className="w-6 h-6 animate-bounce"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </section>

      {/* ── Section 2: How to use ── */}
      <section
        ref={howToRef}
        className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4 py-24"
      >
        <div className="max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary-500 mb-4">
            How to use
          </p>
          <h2 className="text-4xl font-bold text-gray-900 mb-6">
            Any agent. Any API.<br />Three steps.
          </h2>
          <p className="text-lg text-gray-500">
            No OAuth, no API keys — just a wallet.<br />
            Agents discover, pay on-chain, and get results in a single round-trip.
          </p>
        </div>

        {/* Steps */}
        <div className="w-full max-w-3xl grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {[
            {
              step: "01",
              title: "Discover",
              desc: "Browse the marketplace or call GET /execute/:apiId — the gateway returns a 402 with payment instructions.",
            },
            {
              step: "02",
              title: "Pay On-Chain",
              desc: "Sign a pay() transaction on Base. Funds are held in escrow until the API responds successfully.",
            },
            {
              step: "03",
              title: "Get Results",
              desc: "Attach the txHash in X-Payment-Tx header. The gateway verifies, proxies the API, and settles.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="card flex flex-col gap-3">
              <span className="text-3xl font-bold text-primary-100">{step}</span>
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>

        <Link
          href="/docs"
          className="btn-primary px-10 py-3 text-base"
        >
          Read the full guide →
        </Link>
      </section>

      {/* ── Section 3: Features ── */}
      <section className="py-24 px-4 bg-white">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="card text-center">
            <div className="text-3xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold mb-2">Instant Finality</h3>
            <p className="text-gray-600 text-sm">
              Built on Base — fast block times and low fees make per-call payments practical.
            </p>
          </div>
          <div className="card text-center">
            <div className="text-3xl mb-4">🔒</div>
            <h3 className="text-lg font-semibold mb-2">Buyer Protection</h3>
            <p className="text-gray-600 text-sm">
              Funds sit in escrow. If the API fails, you get a full refund automatically.
            </p>
          </div>
          <div className="card text-center">
            <div className="text-3xl mb-4">🤖</div>
            <h3 className="text-lg font-semibold mb-2">Agent-Native</h3>
            <p className="text-gray-600 text-sm">
              Designed for autonomous AI agents — standard HTTP with on-chain payment proof.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
