/**
 * Single source of truth for turning a Plan record into human-readable
 * feature lines used by the real subscription page and both marketing
 * pricing pages, which previously each had their own near-duplicate parser.
 */
export interface PlanFeatureLines {
  included: string[];
  excluded: string[];
}

function formatTokenLimit(tokenLimit: number): string {
  if (tokenLimit >= 1_000_000) {
    const millions = tokenLimit / 1_000_000;
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M tokens/month`;
  }
  return `${(tokenLimit / 1000).toFixed(0)}k tokens/month`;
}

function formatSupportLabel(raw: string): string {
  return raw
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Curated marketing copy for the three standard tiers (matched by plan name).
// Custom or renamed plans fall back to the generated lines below.
const TIER_FEATURES: Record<string, string[]> = {
  free: ["50K AI tokens per month",
  "Access to free and paid AI models",
  "Up to 5 coding projects",
  "Up to 20 documents",
  "Up to 10 presentation slides",
  "File uploads and attachments",
  "Help desk support",
  "Access to AI specialists",
],
  plus: ["1M AI tokens per month",
  "200 video credits per month",
  "Access to 50+ free and paid AI models",
  "Up to 100 coding projects",
  "Generate up to 120 high-quality images",
  "Generate up to 40 high-resolution videos",
  "Create up to 600 documents, sheets, slides and PDFs",
  "Early access to new premium features",
  "Expanded storage in your Assets Vault",
  "Access to the AI voice chatbot agent",
  "Access to AI specialists and agents",
],
  pro: ["2M AI tokens per month",
  "410 video credits per month",
  "Access to 50+ free and paid AI models",
  "Up to 200 coding projects",
  "Generate up to 240 high-quality images",
  "Generate up to 90 high-resolution videos",
  "Create up to 1,200 documents, sheets, slides and PDFs",
  "Priority Plus customer support",
  "Early access to new premium features",
  "Expanded Assets Vault storage with extended retention",
  "Access to the AI voice chatbot agent",
  "Access to AI specialists and agents",
],
};

export function getPlanFeatureLines(plan: any): PlanFeatureLines {
  const tier = TIER_FEATURES[String(plan?.name ?? "").trim().toLowerCase()];
  if (tier) return { included: [...tier], excluded: [] };

  const included: string[] = [];
  const excluded: string[] = [];

  if (plan.tokenLimit) {
    included.push(formatTokenLimit(Number(plan.tokenLimit)));
  }

  // Model choice isn't plan-restricted on any tier every plan can use any
  // model, gated purely by wallet balance (paid models bill real cost against
  // the token wallet; once it's exhausted, only free models keep working).
  included.push("All AI models, including paid");

  if (plan.documentGenEnabled) {
    included.push("Document generation");
  } else {
    excluded.push("Document generation");
  }

  if (plan.imageGenEnabled) {
    included.push("Image generation");
  } else {
    excluded.push("Image generation");
  }

  if (plan.videoGenEnabled) {
    const credits = Number(plan.monthlyVideoCredits ?? 0);
    included.push(credits > 0 ? `${credits} video credits/month` : "Video generation");
  } else {
    excluded.push("Video generation");
  }

  const features = plan.features;
  if (features && typeof features === "object" && !Array.isArray(features)) {
    if (features.maxModels === -1) {
      included.push("Unlimited AI models");
    } else if (features.maxModels) {
      included.push(`${features.maxModels} AI models`);
    }

    if (features.attachments) {
      included.push("File uploads & attachments");
    }

    if (features.support) {
      included.push(`${formatSupportLabel(String(features.support))} support`);
    }
  } else if (Array.isArray(features)) {
    included.push(...features);
  }

  if (included.length === 0) {
    included.push(`Everything in ${plan.name}`);
  }

  return { included, excluded };
}
