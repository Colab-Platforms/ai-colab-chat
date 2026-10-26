
export const GUEST_LIMITS = {
  singleMessages: 3,
  multiMessages: 2,
  ipMessages: 5,
  ipWindowDays: 30,
  maxCompareModels: 3,
  ipSessionsPerDay: 20,
  maxChats: 5,
  walletTokens: 20_000,
  maxCompletionTokens: 1_500,
  tokenExpiresIn: "30d",
} as const;

export const GUEST_MODEL_EXTERNAL_IDS: readonly string[] = [
  // "openai/gpt-oss-20b:free",
  // "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "openai/gpt-5.6-sol", 
  "deepseek/deepseek-v4-flash",
  "anthropic/claude-opus-5",
  "anthropic/claude-sonnet-5", 
  // "mistralai/mistral-small-2603",
];

export const GUEST_LIMIT_REACHED_CODE = "GUEST_LIMIT_REACHED";
export const GUEST_RESTRICTED_CODE = "GUEST_RESTRICTED";
