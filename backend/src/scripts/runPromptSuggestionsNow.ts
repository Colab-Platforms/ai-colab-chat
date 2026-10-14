
import "dotenv/config";
import PromptSuggestionService from "@/modules/prompt-suggestion/prompt-suggestion.service.js";

async function main() {
  const service = new PromptSuggestionService();
  const created = await service.generateBatch();

  if (created === 0) {
    console.error("[prompt-suggestions] manual run: the LLM returned no usable suggestions");
    process.exit(1);
  }

  console.log(`[prompt-suggestions] manual run: saved ${created} new suggestion(s):`);
  for (const s of await service.latest()) console.log(`  - ${s.text}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[prompt-suggestions] manual run error:", error);
    process.exit(1);
  });
