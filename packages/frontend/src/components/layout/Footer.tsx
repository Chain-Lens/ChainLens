export default function Footer() {
  return (
    <footer className="mt-auto" style={{ borderTop: "1px solid var(--border)", background: "var(--bg2)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex justify-between items-center text-sm" style={{ color: "var(--text3)" }}>
          <p>ChainLens — Agent API Marketplace on Base</p>
          <p>Built on Base Sepolia</p>
        </div>
      </div>
    </footer>
  );
}
