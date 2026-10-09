/**
 * Generates one document spec and renders it through every theme.
 *
 * Rendering a single spec N ways is what makes the themes actually
 * comparable — three different documents would confound theme differences
 * with content differences.
 *
 * Usage:
 *   npx tsx src/scripts/generateThemeSamples.ts
 *   npx tsx src/scripts/generateThemeSamples.ts --model=openai/gpt-4.1 --out=./bench
 */

import { mkdir, writeFile } from "node:fs/promises";
import dotenv from "dotenv";
import { renderSpecToPdf } from "@/modules/document/document.pdf.js";
import { generateSpec } from "@/modules/document/document.spec.service.js";
import { closeBrowser } from "@/utils/browserPool.js";
import {
  DOCUMENT_THEMES,
  type DocumentSpec,
} from "@/modules/document/document.types.js";

dotenv.config();

const parseArg = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const PROMPT =
  "Create a professional report on microservice adoption for an engineering leadership team. " +
  "Include an executive summary, a comparison table of monolith vs microservices across at least " +
  "five dimensions, a risk callout, a phased migration plan as a numbered list, key facts as " +
  "label/value pairs, and a closing recommendation.";

const SOURCE = `
Microservice architectures decompose an application into independently deployable services.
Benefits: independent scaling, fault isolation, team autonomy. Costs: operational complexity,
inter-service latency, distributed transactions, harder debugging. Teams below ~20 engineers
usually see net negative returns. A modular monolith captures most of the organisational benefit
at a fraction of the operational cost. Migrate incrementally: extract the highest-churn, most
independent bounded context first (typically auth or notifications). Observability must exist
before the second service ships. Service meshes pay off past ~12 services. Database-per-service
is the hardest constraint to honour and the most commonly violated.
`.trim();

const run = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set.");
    process.exit(1);
  }

  const model = parseArg("model") ?? "google/gemini-2.5-flash";
  const outDir = parseArg("out") ?? "./bench";
  await mkdir(outDir, { recursive: true });

  process.env.DOCUMENT_SPEC_MODEL = model;
  console.log(`\nSpec model: ${model}`);

  const specStart = Date.now();
  const { spec: anySpec, promptTokens, completionTokens } = await generateSpec(
    "document",
    PROMPT,
    SOURCE,
  );
  const spec = anySpec as DocumentSpec;
  const specMs = Date.now() - specStart;

  const blockTypes = spec.blocks.reduce<Record<string, number>>((acc, block) => {
    acc[block.type] = (acc[block.type] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`Spec generated in ${specMs}ms`);
  console.log(`  title:  ${spec.title}`);
  console.log(`  tokens: ${promptTokens} in / ${completionTokens} out`);
  console.log(`  blocks: ${spec.blocks.length}`);
  console.log(`  types:  ${Object.entries(blockTypes).map(([t, n]) => `${t}×${n}`).join(", ")}`);
  // gemini-2.5-flash rates; only indicative if --model overrides the default.
  console.log(`  cost:   ~$${((promptTokens * 0.3 + completionTokens * 2.5) / 1_000_000).toFixed(5)}\n`);

  await writeFile(`${outDir}/spec.json`, JSON.stringify(spec, null, 2));

  for (const theme of DOCUMENT_THEMES) {
    const start = Date.now();
    const pdf = await renderSpecToPdf(spec, theme);
    const path = `${outDir}/sample-${theme}.pdf`;
    await writeFile(path, pdf);
    console.log(
      `  ${theme.padEnd(14)} ${String(Date.now() - start).padStart(5)}ms  ` +
        `${String(pdf.length).padStart(7)} bytes  ->  ${path}`,
    );
  }

  console.log("");
  await closeBrowser();
};

run().catch(async (error) => {
  console.error("FAILED:", error);
  await closeBrowser();
  process.exit(1);
});
