const ICON_PREFIXES = [
  "anthropic",
  "deepseek",
  "google",
  "moonshotai",
  "openai",
  "perplexity",
  "x-ai",
];

// Providers whose icon filename doesn't follow the "<prefix>.png" convention.
const ICON_OVERRIDES: Record<string, string> = {
  nvidia: "/model_icons/nvidia_logo.jpg",
  poolside: "/model_icons/poolside-ai.png",
  cohere: "/model_icons/cohere-logo.png",
  mistral: "/model_icons/mistral-ai-icon.webp",
  qwen: "/model_icons/Qwen_logo.svg.webp",
};

export function getModelIcon(externalId: string): string | null {
  if (!externalId) return null;
  const lower = externalId.toLowerCase();

  const overrideMatch = Object.keys(ICON_OVERRIDES).find((prefix) =>
    lower.startsWith(prefix),
  );
  if (overrideMatch) return ICON_OVERRIDES[overrideMatch];

  const match = ICON_PREFIXES.find((prefix) => lower.startsWith(prefix));
  return match ? `/model_icons/${match}.png` : null;
}
