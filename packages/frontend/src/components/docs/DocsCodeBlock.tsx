"use client";

import { useState } from "react";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs px-2 py-1 rounded transition-colors"
      style={{
        background: "var(--border)",
        color: "var(--text2)",
        border: "1px solid var(--border2)",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export default function DocsCodeBlock({
  code,
  language = "typescript",
}: {
  code: string;
  language?: string;
}) {
  return (
    <div
      className="relative rounded-xl overflow-hidden my-6"
      style={{ border: "1px solid var(--border2)" }}
    >
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ background: "var(--bg3)" }}
      >
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
          <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
          <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
          <span className="ml-3 text-xs font-mono" style={{ color: "var(--text2)" }}>
            {language}
          </span>
        </div>
        <CopyButton text={code} />
      </div>
      <pre
        className="px-6 py-5 text-sm leading-relaxed overflow-x-auto"
        style={{ background: "var(--bg)", color: "var(--text)", fontFamily: "var(--font-mono)" }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
