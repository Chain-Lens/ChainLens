import type { ApiListingPublic } from "@chain-lens/shared";
import ApiCard from "./ApiCard";

export default function ApiGrid({ apis }: { apis: ApiListingPublic[] }) {
  if (apis.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--text3)]">
        No APIs available yet. Check back later!
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {apis.map((api) => (
        <ApiCard key={api.id} api={api} />
      ))}
    </div>
  );
}
