/**
 * Published marketing facts. Pricing and FAQ copy match the homepage.
 * The on-page FAQ still says "Colab AI"; that shorter label is left in the
 * questions so the visible text and FAQ schema stay identical.
 */

export interface MarketingPlan {
  id: number;
  name: string;
  price: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  isPopular: boolean;
  isFree: boolean;
}

export const FALLBACK_PLANS: MarketingPlan[] = [
  {
    id: 1,
    name: "Free",
    price: 0,
    yearlyPrice: 0,
    description: "Get started at no cost for your first month.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Community Support",
      "50,000 monthly tokens",
    ],
    isPopular: false,
    isFree: true,
  },
  {
    id: 2,
    name: "Plus",
    price: 1799,
    yearlyPrice: 17988,
    description: "Ideal for Plus users.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Priority Support",
      "10,00,000 monthly tokens",
    ],
    isPopular: true,
    isFree: false,
  },
  {
    id: 3,
    name: "Pro",
    price: 3699,
    yearlyPrice: 35988,
    description: "Ideal for Pro users.",
    features: [
      "Unlimited AI Models",
      "File Uploads & Attachments",
      "Priority Plus Support",
      "20,00,000 monthly tokens",
    ],
    isPopular: false,
    isFree: false,
  },
];

export const FAQ_DATA: [string, [string, string][]][] = [
  [
    "General",
    [
      [
        "How does Colab AI work?",
        "Pick one or more AI models, type your message and get answers in one chat. In Multi mode, each model you choose answers the same prompt side by side so you can compare them.",
      ],
      [
        "Is there a free trial available?",
        "Yes. The Free plan gives you every AI model with about 40 messages a month. No card needed.",
      ],
      [
        "Who is Colab AI built for?",
        "Anyone who uses AI for work or study, from writers and students to founders, marketers and developers. Teams can use Colab AI for Business.",
      ],
      [
        "Can I use multiple AI models at the same time?",
        "Yes. Switch to Multi mode, pick the models you want, and each one answers the same prompt in its own column.",
      ],
      [
        "Can I switch plans later?",
        "Yes. You can move between Free, Plus and Pro from Settings. Changes start from your next billing cycle.",
      ],
      [
        "Does Colab AI work for solo users?",
        "Yes. Free, Plus and Pro are individual plans. You don’t need a team to sign up.",
      ],
    ],
  ],
  [
    "AI Capabilities",
    [
      [
        "Which AI models are included?",
        "Models from OpenAI, Anthropic, Google, DeepSeek, Mistral, Perplexity, Qwen and more, plus image and video models. New models are added as they launch.",
      ],
      [
        "Can Colab AI create images and videos?",
        "Yes, on Plus and Pro. Image Studio and Video Studio use top image and video models from a prompt or your own reference images.",
      ],
      [
        "Can it search the web?",
        "Yes. Web search gives live answers with links to the sources it used.",
      ],
      [
        "Can it make documents?",
        "Yes. Turn notes and files into PDFs, Word documents, PowerPoint decks and Excel sheets.",
      ],
    ],
  ],
  [
    "Integration & Security",
    [
      [
        "Is my data used to train AI models?",
        "No. Your chats and files are not used to train AI models.",
      ],
      [
        "How do I pay?",
        "In rupees through Cashfree. Every payment comes with a GST invoice.",
      ],
      [
        "Can I use Colab AI on my phone?",
        "Yes. Colab AI works in your phone’s browser with the same features as desktop.",
      ],
      [
        "Is there a plan for teams?",
        "Yes. Colab AI for Business adds admin controls, model access settings and one GST invoice for the whole team.",
      ],
    ],
  ],
];

export const PRICING_NOTE =
  "Prices shown exclude 18% GST, added at checkout.";
