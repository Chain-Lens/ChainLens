import Link from "next/link";

export default function SellerEmptyState() {
  return (
    <div className="card text-center py-12">
      <p className="mb-4 text-[var(--text2)]">You haven&apos;t registered any APIs yet.</p>
      <Link href="/register" className="btn-primary px-4 py-2 text-sm">
        Register Your First API
      </Link>
    </div>
  );
}
