import { FAQ_DATA, FALLBACK_PLANS, PRICING_NOTE } from "@/lib/marketing-facts";
import { PUBLIC_PATHS, SITE_NAME, SITE_URL } from "@/lib/seo";

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function buildLlmsTxt() {
  const plans = FALLBACK_PLANS.map((plan) => {
    if (plan.isFree) {
      return `- Free: ${plan.description} No card needed. Listed features: ${plan.features.join("; ")}. The FAQ also says the Free plan gives every AI model with about 40 messages a month.`;
    }
    return `- ${plan.name}: ${inr(plan.price)}/month + GST. ${plan.description} Listed features: ${plan.features.join("; ")}.`;
  }).join("\n");

  const faq = FAQ_DATA.map(([group, items]) => {
    const lines = items.map(([question, answer]) => `### ${question}\n${answer}`).join("\n\n");
    return `## ${group}\n\n${lines}`;
  }).join("\n\n");

  const pages = PUBLIC_PATHS.map((path) => {
    const url = path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
    return `- ${url}`;
  }).join("\n");

  return `# ${SITE_NAME}

> ${SITE_NAME} is a multi-model chat product: one login to message and compare models, plus document, image, video, specialist and agent tools in the same workspace.

This file summarises the public pages of ${SITE_URL}. It uses only statements already published on those pages. Some on-page questions say "Colab AI"; that shorter label refers to ${SITE_NAME}.

## Product
- One platform for leading AI models. Ask once, compare answers side by side. No subscription juggling. No context switching.
- One plan instead of many AI subscriptions. Switch models mid-chat without losing context.
- Chat with ChatGPT, Claude, Gemini and more side by side, keep one memory across every model, and pay for a single plan. Start free. No card needed.
- 30+ AI models, and the list grows. Models from OpenAI, Anthropic, Google, DeepSeek, Mistral, Perplexity, Qwen and more, plus image and video models.
- Features in the same chat: Documents (PDFs, slide decks, Word docs and Excel sheets), Image Studio, Video Studio, Specialists, Agents, and Projects.
- Web search gives live answers with links to the sources it used.
- Chats and files are not used to train AI models.
- It works in a phone browser with the same features as desktop.
- For people who use AI for work or study, from writers and students to founders, marketers and developers. Teams can use the business workspace.

## Pricing
${PRICING_NOTE} Payments are in rupees through Cashfree. Every payment comes with a GST invoice. Cancel anytime. Secure payments by Cashfree. No training on your data.
${plans}
- Where a yearly price is offered, the page shows yearly billing as up to 20% off, billed once per year + GST, with tokens added monthly.
- Image Studio and Video Studio are on Plus and Pro.
- Higher-tier models draw down tokens faster via a disclosed per-model multiplier. The pricing section points readers to the Terms of Use for billing details.
- You can move between Free, Plus and Pro from Settings. Changes start from the next billing cycle.
- Free, Plus and Pro are individual plans.

## Business
Colab Platforms AI for Business is a shared workspace where a team can use leading AI models for chat, model comparison, documents, images and video, with central billing and admin controls, model access settings, and one GST invoice for the whole team.
${SITE_URL}/business

The business page headline is: "Every top AI model, one workspace for your whole team."
The business page summary is: "Give your team the world's best AI in one simple workspace. Write, research and create faster, with one login and one bill."

## Try without an account
${SITE_URL}/try
Chat with AI models for free. No sign-up needed.

## Support
Raise a support ticket for account or product issues, or send a general message. The support page says the team usually responds within 1–2 business days.
Email: support@colabplatforms.com
${SITE_URL}/support

## FAQ
The questions below are the homepage FAQ, copied as published.

${faq}

## Public pages
${pages}

## Contact
support@colabplatforms.com
`;
}

export function GET() {
  return new Response(buildLlmsTxt(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
