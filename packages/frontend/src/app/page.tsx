import LandingNavbar from "@/components/landing/LandingNavbar";
import LandingHero from "@/components/landing/LandingHero";
import LandingProblem from "@/components/landing/LandingProblem";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingArchitecture from "@/components/landing/LandingArchitecture";
import LandingFeatures from "@/components/landing/LandingFeatures";
import LandingToken from "@/components/landing/LandingToken";
import LandingRoadmap from "@/components/landing/LandingRoadmap";
import LandingDemo from "@/components/landing/LandingDemo";
import LandingWaitlist from "@/components/landing/LandingWaitlist";
import LandingFooter from "@/components/landing/LandingFooter";

export default function Home() {
  return (
    <div className="landing">
      <LandingNavbar />
      <main>
        <LandingHero />
        <LandingProblem />
        <LandingHowItWorks />
        <LandingArchitecture />
        <LandingFeatures />
        <LandingToken />
        <LandingRoadmap />
        <LandingDemo />
        <LandingWaitlist />
      </main>
      <LandingFooter />
    </div>
  );
}
