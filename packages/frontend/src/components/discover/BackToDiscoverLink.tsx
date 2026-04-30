import Link from "next/link";

export default function BackToDiscoverLink({ className }: { className?: string }) {
  return (
    <Link
      href="/discover"
      className={
        className ?? "mb-6 inline-block text-sm text-[var(--text3)] underline underline-offset-2"
      }
    >
      Back to Discover
    </Link>
  );
}
