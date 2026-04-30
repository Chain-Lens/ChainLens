import Link from "next/link";

export default function SellerPageHeader({ address }: { address: string }) {
  return (
    <div className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold text-[var(--text)]">My APIs</h1>
        <p className="mt-1 font-mono text-sm text-[var(--text3)]">{address}</p>
      </div>
      <Link href="/register" className="btn-primary px-4 py-2 text-sm">
        + Register New API
      </Link>
    </div>
  );
}
