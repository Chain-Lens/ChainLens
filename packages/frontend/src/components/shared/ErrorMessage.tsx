export default function ErrorMessage({ message }: { message: string }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p className="text-[var(--red)]">{message}</p>
    </div>
  );
}
