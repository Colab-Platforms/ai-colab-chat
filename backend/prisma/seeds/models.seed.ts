import prisma from "@root/prisma";

export async function seedModels() {
  console.log("🤖 Seeding models...");

  const openRouter = await prisma.modelProvider.findFirst({
    where: { name: "OpenRouter" },
  });

  if (!openRouter) {
    console.log(
      "  ⚠️ OpenRouter provider not found — run modelProviders seed first.");
    return;
  }

  const MODELS = [
    {
      name: "GPT-4o",
      externalId: "openai/gpt-4o",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "OpenAI's fast multimodal flagship model",
      isActive: false,
    },
    {
      name: "GPT-4.1",
      externalId: "openai/gpt-4.1",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "OpenAI's latest generation model",
      isActive: true,
    },
    {
      name: "Claude 3.5 Sonnet",
      externalId: "anthropic/claude-3.5-sonnet",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "Anthropic's most capable model",
      isActive: false,
    },
    {
      name: "Gemini 2.0 Flash",
      externalId: "google/gemini-2.0-flash",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "Google's fast and efficient model",
      isActive: false,
    },
   {
      name: "GPT-OSS 20B (Free)",
      externalId: "openai/gpt-oss-20b:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "OpenAI's open-weight model, free tier",
      isFreeModel: true,
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron Nano 9B (Free)",
      externalId: "nvidia/nemotron-nano-9b-v2:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "NVIDIA's unified reasoning/chat model, free tier",
      isFreeModel: true,
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron 3 Nano 30B (Free)",
      externalId: "nvidia/nemotron-3-nano-30b-a3b:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      description: "NVIDIA's compute-efficient agentic MoE model, free tier",
      isFreeModel: true,
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron 3 Super 120B (Free)",
      externalId: "nvidia/nemotron-3-super-120b-a12b:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      isFreeModel: true,
      description: "NVIDIA's 120B hybrid MoE model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron 3 Ultra 550B (Free)",
      externalId: "nvidia/nemotron-3-ultra-550b-a55b:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      isFreeModel: true,
      description: "NVIDIA's frontier-scale reasoning/orchestration model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron Nano 12B VL (Free)",
      externalId: "nvidia/nemotron-nano-12b-v2-vl:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD", "VISION"],
      isFreeModel: true,
      description: "NVIDIA's multimodal video/document reasoning model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Nemotron 3 Nano Omni (Free)",
      externalId: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD", "VISION"],
      isFreeModel: true,
      description: "NVIDIA's multimodal (image/audio/video) reasoning model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Gemma 4 26B (Free)",
      externalId: "google/gemma-4-26b-a4b-it:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD", "VISION"],
      isFreeModel: true,
      description: "Google DeepMind's instruction-tuned MoE model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Gemma 4 31B (Free)",
      externalId: "google/gemma-4-31b-it:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD", "VISION"],
      isFreeModel: true,
      description: "Google DeepMind's dense multimodal model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "North Mini Code (Free)",
      externalId: "cohere/north-mini-code:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      isFreeModel: true,
      description: "Cohere's agentic coding model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Laguna M.1 (Free)",
      externalId: "poolside/laguna-m.1:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      isFreeModel: true,
      description: "Poolside's flagship coding agent model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Laguna XS 2.1 (Free)",
      externalId: "poolside/laguna-xs-2.1:free",
      modelProviderId: openRouter.id,
      capabilities: ["STANDARD"],
      isFreeModel: true,
      description: "Poolside's lightweight coding agent model, free tier",
      isActive: true,
      tokenMultiplier: 0,
    },
    {
      name: "Seedance 2.0",
      externalId: "bytedance/seedance-2.0",
      modelProviderId: openRouter.id,
      capabilities: ["VIDEO_GENERATION"],
      description: "ByteDance's full-quality video model — 480p/720p/1080p/4K, 4-15s clips",
      isActive: true,
      // Calibrated 2026-09-07 straight from OpenRouter's live
      // GET /api/v1/videos/models pricing_skus (not the marketing page,
      // which only quotes the 480p/4K endpoints): video_tokens=$0.000007/tok
      // (480p/720p tier), video_tokens_1080p=$0.0000077/tok,
      // video_tokens_4k=$0.000004/tok. Tokens/sec = width*height*24/1024
      // (OpenRouter's own formula) at each resolution's standard size
      // (854x480 / 1280x720 / 1920x1080 / 3840x2160). Verified against the
      // model page's own Providers table: 720p computes to exactly
      // $0.1512/sec, matching the table's quoted example precisely.
      // Each break-even $/sec × 63,362 tokens/$ (Pro plan: ₹1499/mo ÷
      // 1,000,000 tokens ÷ ₹94.98/$) × 1.5 margin:
      //   480p:  $0.06728/sec → 6,394 tokens/sec
      //   720p:  $0.1512/sec  → 14,371 tokens/sec
      //   1080p: $0.37422/sec → 35,570 tokens/sec
      //   4K:    $0.7776/sec  → 73,904 tokens/sec
      // videoCostPerSecond is only a last-resort fallback for a resolution
      // string outside this map — every resolution this model actually
      // supports is in videoCostPerSecondByResolution below.
      videoCostPerSecond: 14371,
      videoCostPerSecondByResolution: {
        "480p": 6394,
        "720p": 14371,
        "1080p": 35570,
        "4K": 73904,
      },
      // Image-to-video (frame_images) is CHEAPER on this model — its own
      // pricing_skus: video_tokens_with_video_input=$0.0000043/tok (480p/720p,
      // ~39% below text-only), video_tokens_1080p_with_video_input=$0.0000047,
      // video_tokens_4k_with_video_input=$0.0000024. Same tokens/sec formula
      // and margin as above:
      //   480p:  $0.04133/sec → 3,928 tokens/sec
      //   720p:  $0.09288/sec → 8,829 tokens/sec
      //   1080p: $0.22842/sec → 21,714 tokens/sec
      //   4K:    $0.46656/sec → 44,345 tokens/sec
      videoCostPerSecondByResolutionImageInput: {
        "480p": 3928,
        "720p": 8829,
        "1080p": 21714,
        "4K": 44345,
      },
      // Video-credit pricing (CreditWallet unit, $0.03/credit real cost, no
      // multiplier) — same $/sec figures above divided by $0.03:
      //   480p: 2.2427  720p: 5.04  1080p: 12.474  4K: 25.92 credits/sec
      creditCostPerSecond: 5.04,
      creditCostPerSecondByResolution: {
        "480p": 2.2427,
        "720p": 5.04,
        "1080p": 12.474,
        "4K": 25.92,
      },
      //   480p: 1.3777  720p: 3.096  1080p: 7.614  4K: 15.552 credits/sec
      creditCostPerSecondByResolutionImageInput: {
        "480p": 1.3777,
        "720p": 3.096,
        "1080p": 7.614,
        "4K": 15.552,
      },
    },
    {
      name: "Seedance 2.0 Mini",
      externalId: "bytedance/seedance-2.0-mini",
      modelProviderId: openRouter.id,
      capabilities: ["VIDEO_GENERATION"],
      description: "ByteDance's cheapest video model — 480p/720p, 4-15s clips, text/image/video/audio inputs",
      isActive: true,
      // Same method as Seedance 2.0 above, using this model's own
      // pricing_skus: video_tokens=$0.0000035/tok (flat across 480p/720p —
      // no _1080p/_4k keys since this model only supports those two
      // resolutions). Tokens/sec via the same width*height*24/1024 formula:
      //   480p (854x480):  9,611 tok/sec × $0.0000035 = $0.03364/sec → 3,197 tokens/sec
      //   720p (1280x720): 21,600 tok/sec × $0.0000035 = $0.0756/sec  → 7,185 tokens/sec
      videoCostPerSecond: 3197,
      videoCostPerSecondByResolution: {
        "480p": 3197,
        "720p": 7185,
      },
      // video_tokens_with_video_input=$0.0000021/tok (flat, ~40% below
      // text-only) — same formula/margin:
      //   480p: $0.02018/sec → 1,918 tokens/sec
      //   720p: $0.04536/sec → 4,312 tokens/sec
      videoCostPerSecondByResolutionImageInput: {
        "480p": 1918,
        "720p": 4312,
      },
      // $0.03364/sec and $0.0756/sec above ÷ $0.03/credit:
      creditCostPerSecond: 1.1213,
      creditCostPerSecondByResolution: {
        "480p": 1.1213,
        "720p": 2.52,
      },
      // $0.02018/sec and $0.04536/sec above ÷ $0.03/credit:
      creditCostPerSecondByResolutionImageInput: {
        "480p": 0.6727,
        "720p": 1.512,
      },
    },
    {
      name: "Veo 3.1 Lite",
      externalId: "google/veo-3.1-lite",
      modelProviderId: openRouter.id,
      capabilities: ["VIDEO_GENERATION"],
      description: "Google's cost-effective video model — 720p/1080p with native audio, 4/6/8s clips, 16:9/9:16",
      isActive: true,
      // Unlike Seedance, Veo's pricing_skus are already flat $/sec per
      // resolution (no token-pixel formula) — duration_seconds_with_audio
      // (1080p, the model's larger/default tier) = $0.08/sec,
      // duration_seconds_with_audio_720p = $0.05/sec. Priced for the
      // with-audio rate since there's no audio toggle in the UI and Veo's
      // audio is native/on by default.
      //   720p:  $0.05/sec → 4,752 tokens/sec
      //   1080p: $0.08/sec → 7,603 tokens/sec
      // Also fixed a real bug this pricing check surfaced: Veo 3.1 Lite's
      // actual supported_durations are [4, 6, 8] only (not every integer
      // 4-8) — the dialog previously offered 5s/7s, which OpenRouter would
      // have rejected.
      // No videoCostPerSecondByResolutionImageInput — Veo's pricing_skus
      // have no distinct video/image-input tier (unlike Seedance), so
      // image-to-video on this model costs the same as text-to-video and
      // just falls back to videoCostPerSecondByResolution above.
      videoCostPerSecond: 4752,
      videoCostPerSecondByResolution: {
        "720p": 4752,
        "1080p": 7603,
      },
      // $0.05/sec and $0.08/sec above ÷ $0.03/credit. No image-input
      // variant — same as videoCostPerSecondByResolutionImageInput above.
      creditCostPerSecond: 1.6667,
      creditCostPerSecondByResolution: {
        "720p": 1.6667,
        "1080p": 2.6667,
      },
    },
  ];

  for (const model of MODELS) {
    await prisma.model.upsert({
      where: {
        modelProviderId_externalId: {
          modelProviderId: model.modelProviderId,
          externalId: model.externalId,
        },
      },
      update: {
        name: model.name,
        capabilities: model.capabilities as any,
        description: model.description,
        isActive: model.isActive,
        tokenMultiplier: (model as any).tokenMultiplier ?? 1.0,
        videoCostPerSecond: (model as any).videoCostPerSecond ?? null,
        videoCostPerSecondByResolution: (model as any).videoCostPerSecondByResolution ?? undefined,
        videoCostPerSecondByResolutionImageInput:
          (model as any).videoCostPerSecondByResolutionImageInput ?? undefined,
        creditCostPerSecond: (model as any).creditCostPerSecond ?? null,
        creditCostPerSecondByResolution: (model as any).creditCostPerSecondByResolution ?? undefined,
        creditCostPerSecondByResolutionImageInput:
          (model as any).creditCostPerSecondByResolutionImageInput ?? undefined,
      },
      create: {
        ...model,
        capabilities: model.capabilities as any,
      },
    });
  }

  // Retired/dead free model IDs — kept out of MODELS above so the upsert
  // loop doesn't recreate them, and explicitly deactivated here in case
  // they're already in the DB from an earlier seed run.
  // - openrouter/free: superseded by the curated list above (could route to
  //   non-chat guard/classifier models).
  // - meta-llama/llama-3.3-70b-instruct:free: OpenRouter retired the free
  //   variant; the slug now 404s.
  await prisma.model.updateMany({
    where: {
      modelProviderId: openRouter.id,
      externalId: {
        in: [
          "openrouter/free",
          "meta-llama/llama-3.3-70b-instruct:free",
        ],
      },
    },
    data: { isActive: false },
  });

  console.log(`  ✅ Models seeded: ${MODELS.map((m) => m.name).join(", ")}`);
}
