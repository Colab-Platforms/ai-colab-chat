import OpenAI from "openai";

const getOpenRouterClient = () =>
  new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    defaultHeaders: {
      "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:3000",
      "X-Title": "AI Colab Chat",
    },
  });

export interface OpenRouterJsonCompletionOptions {
  model: string;
  systemPrompt: string;
  userContent: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Non-streaming JSON-object completion for internal/background calls
 * (e.g. context distillation) — the streaming helper below is for
 * user-facing chat only and isn't a fit for a single-shot batch job.
 */
export const createOpenRouterJsonCompletion = async (
  options: OpenRouterJsonCompletionOptions,
) => {
  const { model, systemPrompt, userContent, max_tokens, temperature } =
    options;

  const completion = await getOpenRouterClient().chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    response_format: { type: "json_object" },
    max_tokens: max_tokens ?? 400,
    temperature: temperature ?? 0.2,
  } as any);

  return completion;
};

export interface OpenRouterStreamOptions {
  model: string;
  messages: any[];
  chatType?: string;
  max_tokens?: number;
  plugins?: any[];
  temperature?: number;
  signal?: AbortSignal;
}

export const createOpenRouterStream = async (
  options: OpenRouterStreamOptions,
): Promise<AsyncIterable<any>> => {
  const { model, messages, chatType, plugins, signal } = options;

  const client = getOpenRouterClient();

  // Merge caller-supplied plugins with any capability-driven ones
  const builtinPlugins: any[] = [];
  if (chatType === "WEB_SEARCH")
    builtinPlugins.push({
      id: "web",
      max_results: 2,
      search_context_size: "medium",
    });
  const allPlugins = [...builtinPlugins, ...(plugins ?? [])];

  // console.log("--- Sending Request to OpenRouter ---");
  // console.log(`Model: ${model}`);
  // console.log(`Chat Type: ${chatType}`);
  // console.log("Messages:");
  // messages.forEach((msg, index) => {
  //   console.log(`  [${index}] ${msg.role.toUpperCase()}:`);
  //   if (typeof msg.content === "string") {
  //     console.log(`      ${msg.content.replace(/\n/g, "\n      ")}`);
  //   } else {
  //     console.log(
  //       `      ${JSON.stringify(msg.content, null, 2).replace(/\n/g, "\n      ")}`,
  //     );
  //   }
  // });
  // console.log("---------------------------------------");

  const stream = (await client.chat.completions.create(
    {
      model,
      messages: messages as any,
      max_tokens: options.max_tokens,
      temperature: options.temperature,
      n: chatType === "IMAGE_GENERATION" ? 1 : undefined,
      stream: true,
      stream_options: { include_usage: true },
      // OpenRouter-specific (not part of the OpenAI SDK's types, hence the
      // `as any` cast on the whole call) — adds `usage.cost` (real $ charged
      // by OpenRouter for this request) to the final usage chunk, on top of
      // the standard token counts stream_options.include_usage already gives.
      usage: { include: true },
      modalities: chatType === "IMAGE_GENERATION" ? ["image"] : undefined,
      plugins: allPlugins.length > 0 ? allPlugins : undefined,
    } as any,
    signal ? ({ signal } as any) : undefined,
  )) as unknown as AsyncIterable<any>;

  return stream;
};
