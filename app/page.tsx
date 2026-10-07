import type { Metadata } from "next";
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
import { QA } from "@/components/landing/faq-data";
import Cta from "@/components/landing/cta";
import Footer from "@/components/landing/footer";
import JsonLd from "@/components/json-ld";
import { HOME } from "@/lib/pages";
import { SITE, absolute, faqLd, siteUrl } from "@/lib/seo";

/*
 * Static. The page used to be rendered per request only to swap the call to action for
 * people who were already signed in. /signin already sends a signed-in person on to the
 * agent, so one fixed button does the same job and the whole page can be served from the
 * CDN as plain HTML.
 */
const CTA_HREF = "/signin";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE.name,
    locale: SITE.locale,
    title: HOME.absoluteTitle,
    description: HOME.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Fuuud, a nutrition agent that remembers your health" }],
  },
  twitter: { card: "summary_large_image", title: HOME.absoluteTitle, description: HOME.description, images: ["/twitter-image"] },
};

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl()}/#org`,
      name: SITE.name,
      url: siteUrl(),
      logo: { "@type": "ImageObject", url: absolute("/icon-512.png"), width: 512, height: 512 },
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl()}/#site`,
      url: siteUrl(),
      name: SITE.name,
      description: HOME.description,
      inLanguage: "en-NG",
      publisher: { "@id": `${siteUrl()}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: SITE.name,
      url: siteUrl(),
      description: HOME.description,
      applicationCategory: "HealthApplication",
      operatingSystem: "Web",
      inLanguage: "en-NG",
      offers: { "@type": "Offer", price: "0", priceCurrency: "NGN" },
      publisher: { "@id": `${siteUrl()}/#org` },
    },
  ],
};

export default function Landing() {
  return (
    <>
      <JsonLd data={graph} />
      <JsonLd data={faqLd(QA)} />
      <Rails />
      <Nav ctaHref={CTA_HREF} ctaLabel="Sign in" />

      <main id="main">
        <Hero ctaHref={CTA_HREF} ctaLabel="Start with Google" />
        <Marquee />
        <Problem />
        <HowItWorks />
        <Features />
        <Comparison />
        <Stack />
        <Ownership />
        <Faq />
        <Cta ctaHref={CTA_HREF} ctaLabel="Start with Google" />
      </main>

      <Footer />
    </>
  );
}
