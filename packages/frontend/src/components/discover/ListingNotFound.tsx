import BackToDiscoverLink from "./BackToDiscoverLink";

export default function ListingNotFound() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <p className="text-[var(--red)]">Listing not found.</p>
      <BackToDiscoverLink className="mt-4 inline-block text-sm text-[var(--text3)] underline underline-offset-2" />
    </div>
  );
}
