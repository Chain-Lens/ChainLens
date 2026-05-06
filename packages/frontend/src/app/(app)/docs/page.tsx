import DocsHero from "@/components/docs/DocsHero";
import DocsToc from "@/components/docs/DocsToc";
import DocsPrereqsSection from "@/components/docs/DocsPrereqsSection";
import DocsSdkSection from "@/components/docs/DocsSdkSection";
import DocsCliSection from "@/components/docs/DocsCliSection";
import DocsFlowSection from "@/components/docs/DocsFlowSection";
import DocsStep1Section from "@/components/docs/DocsStep1Section";
import DocsStep2Section from "@/components/docs/DocsStep2Section";
import DocsStep3Section from "@/components/docs/DocsStep3Section";
import DocsStep4Section from "@/components/docs/DocsStep4Section";
import DocsQuickstartSection from "@/components/docs/DocsQuickstartSection";
import DocsMcpSection from "@/components/docs/DocsMcpSection";
import DocsContractSection from "@/components/docs/DocsContractSection";
import DocsAltSection from "@/components/docs/DocsAltSection";

export default function DocsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <DocsHero />
      <DocsToc />
      <DocsPrereqsSection />
      <DocsSdkSection />
      <DocsCliSection />
      <DocsFlowSection />
      <DocsStep1Section />
      <DocsStep2Section />
      <DocsStep3Section />
      <DocsStep4Section />
      <DocsQuickstartSection />
      <DocsMcpSection />
      <DocsContractSection />
      <DocsAltSection />
    </div>
  );
}
