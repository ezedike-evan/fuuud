import { getOwnerAddress } from "@/lib/session.ts";
import Rails from "@/components/landing/rails";
import Nav from "@/components/landing/nav";
import Hero from "@/components/landing/hero";
import Marquee from "@/components/landing/marquee";
import Problem from "@/components/landing/problem";
import HowItWorks from "@/components/landing/how-it-works";
import Features from "@/components/landing/features";
import Comparison from "@/components/landing/comparison";
import Stack from "@/components/landing/stack";
import Ownership from "@/components/landing/ownership";
import Faq from "@/components/landing/faq";
import Cta from "@/components/landing/cta";
import Footer from "@/components/landing/footer";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const address = await getOwnerAddress();
  const ctaHref = address ? "/agent" : "/signin";
  const ctaLabel = address ? "Open your agent" : "Start with Google";
  const navLabel = address ? "Open agent" : "Sign in";

  return (
    <>
      <Rails />
      <Nav ctaHref={ctaHref} ctaLabel={navLabel} />

      <main>
        <Hero ctaHref={ctaHref} ctaLabel={ctaLabel} />
        <Marquee />
        <Problem />
        <HowItWorks />
        <Features />
        <Comparison />
        <Stack />
        <Ownership />
        <Faq />
        <Cta ctaHref={ctaHref} ctaLabel={ctaLabel} />
      </main>

      <Footer />
    </>
  );
}
