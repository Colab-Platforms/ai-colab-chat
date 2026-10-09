/**
 * Exercises the two-stage document-intent detection against phrasings that
 * matter — especially the lookalikes that a keyword matcher would get wrong.
 *
 * Usage: npx tsx src/scripts/testDocumentIntent.ts
 */

import dotenv from "dotenv";
import {
  detectDocumentIntent,
  passesDocumentGate,
  type DocumentIntentMode,
} from "@/modules/document/document.intent.js";

dotenv.config();

const LAST_ANSWER =
  "Microservices offer independent scaling and fault isolation but add operational " +
  "complexity. Teams under 20 engineers usually see net negative returns.";

const CASES: Array<{ msg: string; expect: DocumentIntentMode; note?: string }> = [
  // --- should produce a document ---
  { msg: "generate a pdf of this", expect: "REPLACE" },
  { msg: "create a PDF about database indexing", expect: "REPLACE" },
  { msg: "make me a pdf", expect: "REPLACE" },
  { msg: "export that as a PDF", expect: "REPLACE" },
  { msg: "put that in a document please", expect: "REPLACE" },
  { msg: "can you turn this into a report", expect: "REPLACE" },
  { msg: "give me this as a pdf file", expect: "REPLACE" },
  { msg: "iska pdf banao", expect: "REPLACE", note: "hinglish" },
  { msg: "explain microservices and give me a PDF", expect: "AUGMENT" },
  { msg: "compare postgres vs mysql and send me a report", expect: "AUGMENT" },

  // --- must NOT produce a document ---
  { msg: "how do I generate a PDF in Node?", expect: "NONE", note: "the killer false positive" },
  { msg: "why is my pdf library throwing an error", expect: "NONE" },
  { msg: "what is a PDF?", expect: "NONE" },
  { msg: "read this PDF and explain it to me", expect: "NONE", note: "consume, not produce" },
  { msg: "summarise the attached document", expect: "NONE", note: "consume, not produce" },
  { msg: "which excel formula sums a column?", expect: "NONE" },
  { msg: "what are the tradeoffs of microservices?", expect: "NONE", note: "gate should stop this free" },
  { msg: "write me a poem about the sea", expect: "NONE", note: "gate should stop this free" },

  // --- regression: long pasted content ---
  // A 2000-char length cap in the gate used to reject these outright, killing
  // the most natural way to ask for a PDF: paste the material with it.
  {
    msg:
      "generate a pdf of following data\n" +
      "Absolutely — here is a detailed, in-depth explanation of what an AI agent is. " +
      "An AI agent is a system that perceives its environment and acts upon it. ".repeat(80),
    expect: "REPLACE",
    note: "long paste, instruction at START",
  },
  {
    msg:
      "An AI agent is a system that perceives its environment and acts upon it. ".repeat(80) +
      "\n\nturn all of that into a pdf report please",
    expect: "REPLACE",
    note: "long paste, instruction at END",
  },
];

const run = async () => {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set.");
    process.exit(1);
  }

  console.log(`\nIntent model: ${process.env.DOCUMENT_INTENT_MODEL ?? "google/gemini-2.5-flash"}\n`);
  console.log(
    "GATE  EXPECT   GOT      CONF  OK   MESSAGE",
  );
  console.log("-".repeat(104));

  let pass = 0;
  let gateStopped = 0;

  for (const testCase of CASES) {
    const gated = passesDocumentGate(testCase.msg);
    if (!gated) gateStopped += 1;

    const started = Date.now();
    const result = await detectDocumentIntent(testCase.msg, LAST_ANSWER);
    const ms = Date.now() - started;

    const ok = result.intent === testCase.expect;
    if (ok) pass += 1;

    console.log(
      `${(gated ? "yes" : "no ").padEnd(6)}` +
        `${testCase.expect.padEnd(9)}` +
        `${result.intent.padEnd(9)}` +
        `${result.confidence.toFixed(2).padStart(4)}  ` +
        `${(ok ? "PASS" : "FAIL").padEnd(5)}` +
        `${testCase.msg.slice(0, 46)}` +
        `${testCase.note ? `  (${testCase.note})` : ""}` +
        `${gated ? `  [${ms}ms]` : ""}`,
    );
  }

  console.log("-".repeat(104));
  console.log(`\n  ${pass}/${CASES.length} correct`);
  console.log(`  ${gateStopped}/${CASES.length} stopped free at the regex gate (no model call)\n`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
