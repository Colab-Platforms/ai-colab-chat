/**
 * Single source of truth for turning a Plan record into human-readable
 * feature lines — used by the real subscription page and both marketing
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

export function getPlanFeatureLines(plan: any): PlanFeatureLines {
  const included: string[] = [];
  const excluded: string[] = [];

  if (plan.tokenLimit) {
    included.push(formatTokenLimit(Number(plan.tokenLimit)));
  }

  if (plan.restrictToFreeModels) {
    included.push("Free AI models only");
    excluded.push("Paid AI models");
  } else {
    included.push("All AI models, including paid");
  }

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
