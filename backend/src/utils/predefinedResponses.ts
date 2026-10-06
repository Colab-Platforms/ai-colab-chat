/**
 * Predefined response engine for AI Colab Chat.
 *
 * Intercepts common/greeting/identity queries before they reach OpenRouter,
 * responding with platform-branded answers regardless of which model is selected.
 *
 * Two-tier lookup for maximum speed:
 *   Tier 1 – Map<string, string> exact O(1) match
 *   Tier 2 – Flat keyword array scan (covers rephrased variants)
 *
 * Mixed-message guard: if the message is > 15 words OR contains real-question
 * signal words, we return null so OpenRouter handles it normally.
 */

// ---------------------------------------------------------------------------
// Platform identity copy (edit here to update all responses at once)
// ---------------------------------------------------------------------------

const PLATFORM_NAME = "AI Colab Chat";

const RESPONSES = {
  greeting: `Hello! Welcome to **${PLATFORM_NAME}**. How can I help you today?`,

  identity: `I'm **${PLATFORM_NAME}**, your intelligent multi-model assistant platform.\n\nI'm not affiliated with any single AI company - I give you access to the best models from OpenAI, Google, Anthropic, Meta, and more, all in one place. The model currently powering your response is shown in your chat settings.\n\nWhat would you like to explore?`,

  platform: `**${PLATFORM_NAME}** is a collaborative AI platform that lets you:\n\n- 💬 **Chat** with multiple AI models simultaneously\n- ⚖️ **Compare** responses side by side\n- 🔄 **Switch models** mid-conversation\n- 📁 **Organise** chats into folders\n- 🎙️ **Use voice input** for hands-free interaction\n\nType a question or task to get started!`,

  help: `Here are some things you can try:\n\n- Ask a question: *"Explain quantum computing in simple terms"*\n- Get help writing: *"Write a professional email declining a meeting"*\n- Brainstorm: *"Give me 10 startup ideas in the edtech space"*\n- Code: *"Write a Python function to reverse a linked list"*\n- Compare models: select multiple models in the selector and send the same prompt!\n\nWhat would you like to do?`,

  creator: `**${PLATFORM_NAME}** was built by our team of engineers to give you seamless access to the world's best AI models - all in one unified interface.\n\nWe're constantly improving the platform. If you have feedback or ideas, we'd love to hear them! 🚀`,

  thanks: `You're welcome! 😊 Happy to help anytime. Is there anything else you'd like to explore?`,

  bye: `Goodbye! 👋 It was great chatting with you. Come back anytime - I'm always here to help!`,
} as const;

function extractPreferredName(contextMemory?: string[]): string | null {
  if (!contextMemory || contextMemory.length === 0) return null;

  const patterns = [
    /^my name is\s+(.+)$/i,
    /^i am\s+(.+)$/i,
    /^i'm\s+(.+)$/i,
    /^call me\s+(.+)$/i,
    /^preferred name\s*[:\-]\s*(.+)$/i,
    /^name\s*[:\-]\s*(.+)$/i,
  ];

  for (const item of contextMemory) {
    const trimmed = item.trim();
    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (!match?.[1]) continue;
      const name = match[1].trim().replace(/[.!?,;:]+$/, "");
      if (name.length > 0) return name;
    }
  }

  return null;
}

function getGreetingResponse(contextMemory?: string[]): string {
  const preferredName = extractPreferredName(contextMemory);
  if (!preferredName) return RESPONSES.greeting;
  return `Hello ${preferredName}! Welcome to **${PLATFORM_NAME}**. How can I help you today?`;
}

// ---------------------------------------------------------------------------
// Real-question signal words (if any appear → fall through to OpenRouter)
// ---------------------------------------------------------------------------

const REAL_QUESTION_SIGNALS = [
  "explain",
  "calculate",
  " code ",
  "write a",
  "write me",
  "generate",
  "summarise",
  "summarize",
  "translate",
  "list all",
  "list the",
  "compare",
  "difference between",
  "what is the",
  "what are the",
  "when did",
  "when was",
  "how many",
  "how much",
  "how do i",
  "how does",
  "why does",
  "why is",
  "why are",
  "where is",
  "where are",
  "which ",
  "define ",
  "tell me about",
  "give me",
  "show me",
  "find me",
  "create a",
  "create me",
  "build a",
  "make a",
  "debug",
  "fix ",
  "review ",
  "analyse",
  "analyze",
];

// ---------------------------------------------------------------------------
// Tier 1: Exact Map lookup
// ---------------------------------------------------------------------------

const EXACT_LOOKUP = new Map<string, string>([
  // Greetings
  ["hi", RESPONSES.greeting],
  ["hii", RESPONSES.greeting],
  ["hello", RESPONSES.greeting],
  ["hello bhai", RESPONSES.greeting],
  ["hello brother", RESPONSES.greeting],
  ["hey", RESPONSES.greeting],
  ["good morning", RESPONSES.greeting],
  ["good afternoon", RESPONSES.greeting],
  ["good evening", RESPONSES.greeting],
  ["good night", RESPONSES.greeting],
  ["howdy", RESPONSES.greeting],
  ["sup", RESPONSES.greeting],
  ["whats up", RESPONSES.greeting],
  ["what's up", RESPONSES.greeting],
  ["yo", RESPONSES.greeting],
  ["hiya", RESPONSES.greeting],
  ["greetings", RESPONSES.greeting],

  // Identity
  ["who are you", RESPONSES.identity],
  ["hello, who are you", RESPONSES.identity],
  ["what are you", RESPONSES.identity],
  ["what is your name", RESPONSES.identity],
  ["whats your name", RESPONSES.identity],
  ["what's your name", RESPONSES.identity],
  ["introduce yourself", RESPONSES.identity],
  ["tell me about yourself", RESPONSES.identity],
  ["are you an ai", RESPONSES.identity],
  ["are you a bot", RESPONSES.identity],
  ["are you chatgpt", RESPONSES.identity],
  ["are you gpt", RESPONSES.identity],
  ["are you gemini", RESPONSES.identity],
  ["are you claude", RESPONSES.identity],
  ["are you an openai product", RESPONSES.identity],
  ["are you made by openai", RESPONSES.identity],
  ["are you made by google", RESPONSES.identity],
  ["are you made by anthropic", RESPONSES.identity],
  ["which ai are you", RESPONSES.identity],
  ["what model are you", RESPONSES.identity],
  ["which model are you", RESPONSES.identity],
  ["what llm are you", RESPONSES.identity],

  // Platform
  ["what is ai colab", RESPONSES.platform],
  ["what is ai colab chat", RESPONSES.platform],
  ["what is this app", RESPONSES.platform],
  ["what is this platform", RESPONSES.platform],
  ["what is this tool", RESPONSES.platform],
  ["what is this", RESPONSES.platform],
  ["what can you do", RESPONSES.platform],
  ["what are your capabilities", RESPONSES.platform],
  ["what are your features", RESPONSES.platform],
  ["how do you work", RESPONSES.platform],
  ["tell me about this app", RESPONSES.platform],
  ["tell me about this platform", RESPONSES.platform],
  ["about this app", RESPONSES.platform],
  ["about ai colab", RESPONSES.platform],

  // Help
  ["help", RESPONSES.help],
  ["help me", RESPONSES.help],
  ["how do i use this", RESPONSES.help],
  ["how to use this", RESPONSES.help],
  ["how to start", RESPONSES.help],
  ["getting started", RESPONSES.help],
  ["get started", RESPONSES.help],
  ["what should i ask", RESPONSES.help],
  ["guide me", RESPONSES.help],
  ["i need help", RESPONSES.help],

  // Creator
  ["who made you", RESPONSES.creator],
  ["who created you", RESPONSES.creator],
  ["who built you", RESPONSES.creator],
  ["who developed you", RESPONSES.creator],
  ["who is your creator", RESPONSES.creator],
  ["who is behind you", RESPONSES.creator],
  ["who is your maker", RESPONSES.creator],
  ["who owns you", RESPONSES.creator],

  // Thanks
  ["thank you", RESPONSES.thanks],
  ["thanks", RESPONSES.thanks],
  ["thx", RESPONSES.thanks],
  ["ty", RESPONSES.thanks],
  ["thanks a lot", RESPONSES.thanks],
  ["thank you so much", RESPONSES.thanks],
  ["many thanks", RESPONSES.thanks],
  ["much appreciated", RESPONSES.thanks],
  ["cheers", RESPONSES.thanks],
  ["ok thanks", RESPONSES.thanks],
  ["ok thank you", RESPONSES.thanks],
  ["great thanks", RESPONSES.thanks],
  ["awesome thanks", RESPONSES.thanks],
  ["perfect thanks", RESPONSES.thanks],

  // Bye
  ["bye", RESPONSES.bye],
  ["goodbye", RESPONSES.bye],
  ["good bye", RESPONSES.bye],
  ["see you", RESPONSES.bye],
  ["see ya", RESPONSES.bye],
  ["cya", RESPONSES.bye],
  ["farewell", RESPONSES.bye],
  ["see you later", RESPONSES.bye],
  ["talk later", RESPONSES.bye],
  ["catch you later", RESPONSES.bye],
  ["take care", RESPONSES.bye],
  ["ttyl", RESPONSES.bye],
]);

// ---------------------------------------------------------------------------
// Tier 2: Keyword scan (for rephrased/prefixed variants not in exact map)
// ---------------------------------------------------------------------------

const KEYWORD_RULES: { keyword: string; response: string }[] = [
  { keyword: "hey there", response: RESPONSES.greeting },
  { keyword: "hi there", response: RESPONSES.greeting },
  { keyword: "hello there", response: RESPONSES.greeting },
  { keyword: "good mornin", response: RESPONSES.greeting }, // "mornin'", "morning"

  { keyword: "who r u", response: RESPONSES.identity },
  { keyword: "are u an ai", response: RESPONSES.identity },
  { keyword: "are u a bot", response: RESPONSES.identity },

  { keyword: "who made this", response: RESPONSES.creator },
  { keyword: "who created this", response: RESPONSES.creator },
  { keyword: "who built this", response: RESPONSES.creator },
];

// ---------------------------------------------------------------------------
// Mixed-message guard: messages longer than this fall through to OpenRouter
// ---------------------------------------------------------------------------

const MAX_WORDS_FOR_PREDEFINED = 15;

function hasRealQuestion(normalised: string): boolean {
  for (const signal of REAL_QUESTION_SIGNALS) {
    if (normalised.includes(signal)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a platform-branded predefined response if the content matches a
 * known intent, or `null` if it should be forwarded to OpenRouter.
 */
export function checkPredefinedResponse(
  content: string,
  contextMemory?: string[],
): string | null {
  const normalised = content
    .toLowerCase()
    .trim()
    .replace(/[^\w\s']/g, " ") // strip punctuation except apostrophes
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();

  // Guard 1: too many words → real message, skip
  const wordCount = normalised.split(" ").length;
  if (wordCount > MAX_WORDS_FOR_PREDEFINED) return null;

  // Guard 2: contains real-question signal → skip
  if (hasRealQuestion(normalised)) return null;

  // Tier 1: exact Map lookup (O(1))
  const exactHit = EXACT_LOOKUP.get(normalised);
  if (exactHit) {
    if (exactHit === RESPONSES.greeting) {
      return getGreetingResponse(contextMemory);
    }
    return exactHit;
  }

  // Tier 2: keyword scan
  for (const rule of KEYWORD_RULES) {
    if (normalised.includes(rule.keyword)) {
      if (rule.response === RESPONSES.greeting) {
        return getGreetingResponse(contextMemory);
      }
      return rule.response;
    }
  }

  return null;
}
