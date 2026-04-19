import Link from "next/link";
import { getMarketplaceApis } from "@/lib/marketplace";
import ApiGrid from "@/components/marketplace/ApiGrid";

type MarketplacePageProps = {
  searchParams?: Promise<{
    category?: string;
    search?: string;
  }>;
};

export default async function MarketplacePage({ searchParams }: MarketplacePageProps) {
  const params = searchParams ? await searchParams : undefined;
  const search = params?.search?.trim() ?? "";
  const category = params?.category?.trim() ?? "";
  const { apis, isMock } = await getMarketplaceApis({
    search: search || undefined,
    category: category || undefined,
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-bold text-[var(--text)]">API Marketplace</h1>
        <p className="text-[var(--text2)]">Browse and purchase verified APIs with on-chain payments</p>
      </div>

      <form className="mb-8 flex flex-wrap gap-4">
        <input
          name="search"
          type="text"
          placeholder="Search APIs..."
          defaultValue={search}
          className="input max-w-md"
        />
        <select
          name="category"
          defaultValue={category}
          className="input max-w-[200px]"
        >
          <option value="">All Categories</option>
          <option value="ai">AI / ML</option>
          <option value="data">Data</option>
          <option value="finance">Finance</option>
          <option value="social">Social</option>
          <option value="utility">Utility</option>
          <option value="general">General</option>
        </select>
        <button type="submit" className="btn-primary px-4 py-2 text-sm">
          Apply
        </button>
        <Link href="/marketplace" className="btn-secondary px-4 py-2 text-sm">
          Reset
        </Link>
      </form>

      {isMock && (
        <div className="mb-6 rounded-lg border border-[rgba(210,153,34,0.3)] bg-[rgba(210,153,34,0.1)] px-4 py-3 text-sm text-[#e3b341]">
          Showing demo data — backend is not connected
        </div>
      )}

      <ApiGrid apis={apis} />
    </div>
  );
}
