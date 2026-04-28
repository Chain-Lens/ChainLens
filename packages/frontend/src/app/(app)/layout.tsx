import ClientOnlyProvider from "@/providers/ClientOnlyProvider";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClientOnlyProvider>
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </ClientOnlyProvider>
  );
}
