import { FAQ_DATA, FALLBACK_PLANS, PRICING_NOTE } from "@/lib/marketing-facts";
import { HOME_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

function offerDescription(plan: (typeof FALLBACK_PLANS)[number]) {
  if (plan.isFree) {
    return `${plan.description} No card needed.`;
  }
  return `₹${plan.price.toLocaleString("en-IN")}/month + GST. ${plan.description} ${PRICING_NOTE}`;
}

/**
 * Homepage structured data. sameAs is omitted: the footer social links are
 * generic network homepages, not profile URLs for this organization.
 */
export function HomeJsonLd() {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        email: "support@colabplatforms.com",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: HOME_DESCRIPTION,
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": ["SoftwareApplication", "WebApplication"],
        "@id": `${SITE_URL}/#app`,
        name: SITE_NAME,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: `${SITE_URL}/`,
        description: HOME_DESCRIPTION,
        provider: { "@id": `${SITE_URL}/#organization` },
        offers: FALLBACK_PLANS.map((plan) => ({
          "@type": "Offer",
          name: plan.name,
          price: String(plan.price),
          priceCurrency: "INR",
          description: offerDescription(plan),
          url: `${SITE_URL}/#pricing`,
          ...(plan.isFree
            ? {}
            : {
                priceSpecification: {
                  "@type": "UnitPriceSpecification",
                  price: String(plan.price),
                  priceCurrency: "INR",
                  unitText: "MONTH",
                  valueAddedTaxIncluded: false,
                },
              }),
        })),
      },
      {
        "@type": "FAQPage",
        "@id": `${SITE_URL}/#faq`,
        url: `${SITE_URL}/#faq`,
        mainEntity: FAQ_DATA.flatMap(([, items]) =>
          items.map(([question, answer]) => ({
            "@type": "Question",
            name: question,
            acceptedAnswer: {
              "@type": "Answer",
              text: answer,
            },
          })),
        ),
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(graph).replace(/</g, "\\u003c"),
      }}
    />
  );
}
